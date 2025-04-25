import path from 'path';
import { 
  ProjectTask, 
  ProjectStatus,
  FileInfo,
  DevelopmentPlan
} from './types.js';
import { Planner } from './planner.js';
import { Coder } from './coder.js';
import { Tester } from './tester.js';
import { Debugger } from './debugger.js';
import { FeedbackHandler } from './feedbackHandler.js';
import logger from '../utils/logger.js';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import config from '../config/config.js';

/**
 * プロジェクト生成クラス
 * プロジェクトの生成プロセスを担当
 */
export class ProjectGenerator {
  private planner: Planner;
  private coder: Coder;
  private tester: Tester;
  private debugger: Debugger;
  private feedbackHandler: FeedbackHandler;
  
  constructor(
    planner: Planner,
    coder: Coder,
    tester: Tester,
    debugger_: Debugger,
    feedbackHandler: FeedbackHandler
  ) {
    this.planner = planner;
    this.coder = coder;
    this.tester = tester;
    this.debugger = debugger_;
    this.feedbackHandler = feedbackHandler;
  }
  
  /**
   * プロジェクト生成の全体プロセスを実行
   * @param task プロジェクトタスク
   * @param notifyProgressFn 進捗通知関数
   */
  public async executeProjectGeneration(
    task: ProjectTask,
    notifyProgressFn: (task: ProjectTask, message: string) => Promise<void>
  ): Promise<string> {
    // 開始を通知
    await notifyProgressFn(task, 'プロジェクト生成を開始します...');
    
    // 1. 計画立案フェーズ前にフィードバックを処理
    await this.feedbackHandler.processQueuedFeedbacks(task, "計画立案", notifyProgressFn);
    
    // 1. 計画立案フェーズ
    task.status = ProjectStatus.PLANNING;
    await notifyProgressFn(task, '開発計画を立案中...');
    
    const plan = await this.planner.createPlan(task);
    task.plan = plan;
    
    await notifyProgressFn(task, `開発計画が完了しました\n生成ファイル数: ${plan.files.length}\n使用技術: ${this.formatTechStack(plan)}`);
    
    // 計画完了の通知とフィードバック募集
    await notifyProgressFn(task, `開発計画が完了しました。
\`task:${task.id}\` をメンションして追加指示を出すことができます。次のフェーズに進む前に30秒間待機します。`);
    
    // 短い待機時間を設けてユーザー入力のチャンスを与える
    await new Promise(resolve => setTimeout(resolve, 30 * 1000));
    
    // 2. コーディングフェーズ前にフィードバックを処理
    await this.feedbackHandler.processQueuedFeedbacks(task, "コーディング", notifyProgressFn);
    
    // 2. コーディングフェーズ
    task.status = ProjectStatus.CODING;
    
    // 引用関係を考慮してファイルを生成する順番を決定
    const sortedFiles = this.sortFilesByDependency(plan.files);
    
    // 各ファイルを生成
    for (let i = 0; i < sortedFiles.length; i++) {
      const fileInfo = sortedFiles[i];
      await notifyProgressFn(task, `ファイルを生成中 (${i+1}/${sortedFiles.length}): ${fileInfo.path}`);
      
      try {
        const content = await this.coder.generateFile(task, fileInfo);
        fileInfo.content = content;
        fileInfo.status = 'generated';
      } catch (error) {
        logger.error(`Error generating file ${fileInfo.path}: ${(error as Error).message}`);
        fileInfo.status = 'error';
        
        // 重要でないファイルの失敗は無視して続行
        await notifyProgressFn(task, `ファイル ${fileInfo.path} の生成中にエラーが発生しましたが、続行します`);
      }
    }
    
    // 依存関係をインストール
    await notifyProgressFn(task, '依存関係をインストール中...');
    await this.coder.installDependencies(task);
    
+    // --- ここから追加 ---
+    // README.md を生成
+    await notifyProgressFn(task, 'README.md を生成中...');
+    await this.coder.generateReadme(task);
+    // --- ここまで追加 ---
+
    // コーディング完了の通知とフィードバック募集
    await notifyProgressFn(task, `コーディングが完了しました。
\`task:${task.id}\` をメンションして追加指示を出すことができます。次のフェーズに進む前に30秒間待機します。`);
    
    await new Promise(resolve => setTimeout(resolve, 30 * 1000));
    
    // 3. テストフェーズ前にフィードバックを処理
    await this.feedbackHandler.processQueuedFeedbacks(task, "テスト", notifyProgressFn);
    
    // 3. テストフェーズ
    task.status = ProjectStatus.TESTING;
    await notifyProgressFn(task, 'テストを実行中...');
    
    const testResult = await this.tester.runTests(task);
    
    // テスト後のフィードバック時間を確保
    await notifyProgressFn(task, `テストが完了しました（${testResult.success ? '成功' : '一部失敗'}）。
\`task:${task.id}\` をメンションして緊急の指示がある場合は30秒以内にお知らせください。`);
    
    await new Promise(resolve => setTimeout(resolve, 30 * 1000));
    
    // 保留中のフィードバックを処理
    await this.feedbackHandler.processQueuedFeedbacks(task, "テスト結果対応", notifyProgressFn);
    
    // テスト中に緊急フィードバックがあった場合の処理
    if (task.hasCriticalFeedback) {
      await notifyProgressFn(task, '緊急の指示があります。計画を見直します...');
      
      // 保留中の緊急フィードバックを処理
      await this.feedbackHandler.processCriticalFeedbacks(task, notifyProgressFn);
      
      // フラグをリセット
      task.hasCriticalFeedback = false;
    }
    
    // 再コーディングが必要な場合
    if (task.requiresRecoding) {
      await notifyProgressFn(task, 'フィードバックに基づいて一部のコードを再生成します...');
      
      // 更新された計画に基づいて必要なファイルのみを再生成
      await this.feedbackHandler.recodeBasedOnFeedback(task, notifyProgressFn);
      
      // 再テスト
      await notifyProgressFn(task, '修正後のコードをテスト中...');
      const retestResult = await this.tester.runTests(task);
      testResult.success = retestResult.success;
      testResult.output += "\n\n--- 再テスト結果 ---\n" + retestResult.output;
    }
    
    // テスト失敗時はデバッグフェーズに進む
    if (!testResult.success && task.errors.length > 0) {
      let debugAttempts = 0;
      const maxDebugRetries = config.agent.maxDebugRetries;
      
      // 4. デバッグフェーズ
      task.status = ProjectStatus.DEBUGGING;
      
      while (debugAttempts < maxDebugRetries) {
        debugAttempts++;
        
        await notifyProgressFn(task, `エラーを修正中... (試行 ${debugAttempts}/${maxDebugRetries})`);
        
        // 最新のエラーを取得
        const latestError = task.errors[task.errors.length - 1];
        
        // エラーを修正
        const fixResult = await this.debugger.fixError(task, latestError);
        
        if (fixResult) {
          // 修正後にテストを再実行
          await notifyProgressFn(task, '修正後のテストを実行中...');
          const retriedTestResult = await this.tester.runTests(task);
          
          if (retriedTestResult.success) {
            // テストが成功した場合はデバッグループを終了
            await notifyProgressFn(task, 'エラーを修正し、テストが成功しました');
            break;
          } else if (debugAttempts >= maxDebugRetries) {
            // 最大試行回数に達した場合
            await notifyProgressFn(task, `最大試行回数 (${maxDebugRetries}) に達しましたが、一部のエラーが解決できませんでした`);
          }
        } else {
          // 修正に失敗した場合
          await notifyProgressFn(task, `エラーの修正に失敗しました (試行 ${debugAttempts}/${maxDebugRetries})`);
          
          if (debugAttempts >= maxDebugRetries) {
            await notifyProgressFn(task, `最大試行回数 (${maxDebugRetries}) に達しましたが、エラーを修正できませんでした`);
          }
        }
      }
    }
    
    // 5. 最終化フェーズ
    // 最終テストの結果を確認
    const finalTestResult = await this.tester.runTests(task);
    
    if (finalTestResult.success) {
      task.status = ProjectStatus.COMPLETED;
      await notifyProgressFn(task, 'プロジェクトが正常に生成され、テストに合格しました');
    } else {
      // テストは失敗したが、プロジェクトとしては生成完了
      task.status = ProjectStatus.COMPLETED;
      await notifyProgressFn(task, 'プロジェクトは生成されましたが、一部のテストに失敗しました');
    }
    
    // プロジェクトをZIPにアーカイブ
    const zipPath = await this.archiveProject(task);
    
    task.endTime = Date.now();
    
    // 完了メッセージ
    const duration = (task.endTime - task.startTime) / 1000;
    await notifyProgressFn(task, `プロジェクト生成が完了しました (所要時間: ${duration.toFixed(1)}秒)`);
    
    return zipPath;
  }
  
  /**
   * プロジェクトをZIPアーカイブに圧縮
   * @param task プロジェクトタスク
   */
  private async archiveProject(task: ProjectTask): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const projectName = path.basename(task.projectPath);
      const zipPath = path.join(path.dirname(task.projectPath), `${projectName}.zip`);
      
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // 最高圧縮率
      });
      
      output.on('close', () => {
        logger.debug(`Project archived: ${zipPath}, size: ${archive.pointer()} bytes`);
        resolve(zipPath);
      });
      
      archive.on('error', (err) => {
        logger.error(`Error archiving project: ${err.message}`);
        reject(err);
      });
      
      archive.pipe(output);
      
      // node_modulesディレクトリを除外してプロジェクトを圧縮
      archive.glob('**/*', {
        cwd: task.projectPath,
        ignore: ['node_modules/**', '*.zip', '*.log', 'logs/**']
      });
      
      archive.finalize();
    });
  }
  
  /**
   * 技術スタックをフォーマット
   * @param plan 開発計画
   */
  private formatTechStack(plan: DevelopmentPlan): string {
    const stack: string[] = [];
    
    if (plan.technicalStack.frontend && plan.technicalStack.frontend.length > 0) {
      stack.push(...plan.technicalStack.frontend);
    }
    
    if (plan.technicalStack.backend && plan.technicalStack.backend.length > 0) {
      stack.push(...plan.technicalStack.backend);
    }
    
    if (plan.technicalStack.database && plan.technicalStack.database.length > 0) {
      stack.push(...plan.technicalStack.database);
    }
    
    if (stack.length === 0 && plan.technicalStack.other && plan.technicalStack.other.length > 0) {
      stack.push(...plan.technicalStack.other);
    }
    
    return stack.join(', ');
  }
  
  /**
   * 依存関係に基づいてファイルをソート
   * @param files ファイル情報の配列
   */
  private sortFilesByDependency(files: FileInfo[]): FileInfo[] {
    const fileMap = new Map<string, FileInfo>();
    files.forEach(file => fileMap.set(file.path, file));
    
    // 依存関係から順序を計算
    const visited = new Set<string>();
    const result: FileInfo[] = [];
    
    const visit = (filePath: string) => {
      if (visited.has(filePath)) return;
      
      const file = fileMap.get(filePath);
      if (!file) return;
      
      visited.add(filePath);
      
      // 依存関係があればそれらを先に処理
      if (file.dependencies) {
        for (const dep of file.dependencies) {
          visit(dep);
        }
      }
      
      result.push(file);
    };
    
    // まずパッケージ設定ファイルを処理
    const configFiles = files.filter(f => {
      const filename = path.basename(f.path).toLowerCase();
      return filename === 'package.json' || 
             filename === 'tsconfig.json' || 
             filename === '.env' || 
             filename === '.env.example' || 
             filename === '.gitignore';
    });
    
    for (const configFile of configFiles) {
      visit(configFile.path);
    }
    
    // 残りのファイルを処理
    for (const file of files) {
      visit(file.path);
    }
    
    return result;
  }
}
