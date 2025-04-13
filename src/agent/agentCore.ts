import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import {
  ProjectTask,
  ProjectStatus,
  ProgressListener,
  ErrorInfo,
  FileInfo,
  DevelopmentPlan
} from './types';
import { Planner } from './planner';
import { Coder } from './coder';
import { Tester } from './tester';
import { Debugger } from './debugger';
import logger from '../utils/logger';
import config from '../config/config';
import { getProjectPath } from '../tools/fileSystem';
import { withTimeout } from '../utils/asyncUtils';

/**
 * エージェントコア
 * 全体のオーケストレーションを行う
 */
export class AgentCore {
  private planner: Planner;
  private coder: Coder;
  private tester: Tester;
  private debugger: Debugger;
  private progressListeners: ProgressListener[] = [];
  private activeTasks: Map<string, ProjectTask> = new Map();
  
  /**
   * AgentCoreを初期化
   * @param planner 計画立案モジュール
   * @param coder コード生成モジュール
   * @param tester テスト実行モジュール
   * @param debugger デバッグモジュール
   */
  constructor(planner: Planner, coder: Coder, tester: Tester, debugger_: Debugger) {
    this.planner = planner;
    this.coder = coder;
    this.tester = tester;
    this.debugger = debugger_;
  }
  
  /**
   * 進捗リスナーを登録
   * @param listener 進捗リスナー関数
   */
  public addProgressListener(listener: ProgressListener): void {
    this.progressListeners.push(listener);
  }
  
  /**
   * 進捗リスナーを削除
   * @param listener 進捗リスナー関数
   */
  public removeProgressListener(listener: ProgressListener): void {
    const index = this.progressListeners.indexOf(listener);
    if (index !== -1) {
      this.progressListeners.splice(index, 1);
    }
  }
  
  /**
   * 進捗更新を全リスナーに通知
   * @param task プロジェクトタスク
   * @param message 進捗メッセージ
   */
  private async notifyProgress(task: ProjectTask, message: string): Promise<void> {
    task.lastProgressUpdate = Date.now();
    task.currentAction = message;
    
    logger.info(`[${task.id}] ${message}`);
    
    for (const listener of this.progressListeners) {
      try {
        await listener(task, message);
      } catch (error) {
        logger.error(`Error in progress listener: ${(error as Error).message}`);
      }
    }
  }
  
  /**
   * 新しいプロジェクトタスクを作成
   * @param userId ユーザーID
   * @param guildId サーバーID
   * @param channelId チャンネルID
   * @param specification 要求仕様
   */
  public createTask(userId: string, guildId: string, channelId: string, specification: string): ProjectTask {
    const taskId = uuidv4();
    const projectPath = getProjectPath(taskId);
    
    const task: ProjectTask = {
      id: taskId,
      userId,
      guildId,
      channelId,
      specification,
      status: ProjectStatus.PENDING,
      errors: [],
      startTime: Date.now(),
      projectPath,
      lastProgressUpdate: Date.now(),
    };
    
    this.activeTasks.set(taskId, task);
    logger.info(`Created new task: ${taskId}`);
    
    return task;
  }
  
  /**
   * タスクIDからタスクを取得
   * @param taskId タスクID
   */
  public getTask(taskId: string): ProjectTask | undefined {
    return this.activeTasks.get(taskId);
  }
  
  /**
   * プロジェクトを生成
   * 全体のプロセスを実行
   * @param task プロジェクトタスク
   * @returns 生成済みプロジェクトのパス
   */
  public async generateProject(task: ProjectTask): Promise<string> {
    try {
      // プロジェクトディレクトリを作成
      await fs.mkdir(task.projectPath, { recursive: true });
      
      // 全体プロセスのタイムアウトを設定
      return await withTimeout(
        this.executeProjectGeneration(task),
        config.agent.maxExecutionTime,
        `Project generation timed out after ${config.agent.maxExecutionTime}ms`
      );
    } catch (error) {
      // エラー発生時の処理
      task.status = ProjectStatus.FAILED;
      task.endTime = Date.now();
      
      const errorMsg = `Project generation failed: ${(error as Error).message}`;
      logger.error(errorMsg);
      
      await this.notifyProgress(task, errorMsg);
      
      throw error;
    } finally {
      // 完了時にタスクをクリーンアップ
      setTimeout(() => {
        // 大きなタスクデータをメモリから解放
        if (task.status === ProjectStatus.COMPLETED || task.status === ProjectStatus.FAILED) {
          this.activeTasks.delete(task.id);
          logger.debug(`Removed completed task from memory: ${task.id}`);
        }
      }, 60000); // 1分後にクリーンアップ
    }
  }
  
  /**
   * プロジェクト生成の全体プロセスを実行
   * @param task プロジェクトタスク
   */
  private async executeProjectGeneration(task: ProjectTask): Promise<string> {
    // 開始を通知
    await this.notifyProgress(task, 'プロジェクト生成を開始します...');
    
    // 1. 計画立案フェーズ
    task.status = ProjectStatus.PLANNING;
    await this.notifyProgress(task, '開発計画を立案中...');
    
    const plan = await this.planner.createPlan(task);
    task.plan = plan;
    
    await this.notifyProgress(task, `開発計画が完了しました\n生成ファイル数: ${plan.files.length}\n使用技術: ${this.formatTechStack(plan)}`);
    
    // 2. コーディングフェーズ
    task.status = ProjectStatus.CODING;
    
    // 引用関係を考慮してファイルを生成する順番を決定
    const sortedFiles = this.sortFilesByDependency(plan.files);
    
    // 各ファイルを生成
    for (let i = 0; i < sortedFiles.length; i++) {
      const fileInfo = sortedFiles[i];
      await this.notifyProgress(task, `ファイルを生成中 (${i+1}/${sortedFiles.length}): ${fileInfo.path}`);
      
      try {
        const content = await this.coder.generateFile(task, fileInfo);
        fileInfo.content = content;
        fileInfo.status = 'generated';
      } catch (error) {
        logger.error(`Error generating file ${fileInfo.path}: ${(error as Error).message}`);
        fileInfo.status = 'error';
        
        // 重要でないファイルの失敗は無視して続行
        await this.notifyProgress(task, `ファイル ${fileInfo.path} の生成中にエラーが発生しましたが、続行します`);
      }
    }
    
    // 依存関係をインストール
    await this.notifyProgress(task, '依存関係をインストール中...');
    await this.coder.installDependencies(task);
    
    // 3. テストフェーズ
    task.status = ProjectStatus.TESTING;
    await this.notifyProgress(task, 'テストを実行中...');
    
    const testResult = await this.tester.runTests(task);
    
    // テスト失敗時はデバッグフェーズに進む
    if (!testResult.success && task.errors.length > 0) {
      let debugAttempts = 0;
      const maxDebugRetries = config.agent.maxDebugRetries;
      
      // 4. デバッグフェーズ
      task.status = ProjectStatus.DEBUGGING;
      
      while (debugAttempts < maxDebugRetries) {
        debugAttempts++;
        
        await this.notifyProgress(task, `エラーを修正中... (試行 ${debugAttempts}/${maxDebugRetries})`);
        
        // 最新のエラーを取得
        const latestError = task.errors[task.errors.length - 1];
        
        // エラーを修正
        const fixResult = await this.debugger.fixError(task, latestError);
        
        if (fixResult) {
          // 修正後にテストを再実行
          await this.notifyProgress(task, '修正後のテストを実行中...');
          const retriedTestResult = await this.tester.runTests(task);
          
          if (retriedTestResult.success) {
            // テストが成功した場合はデバッグループを終了
            await this.notifyProgress(task, 'エラーを修正し、テストが成功しました');
            break;
          } else if (debugAttempts >= maxDebugRetries) {
            // 最大試行回数に達した場合
            await this.notifyProgress(task, `最大試行回数 (${maxDebugRetries}) に達しましたが、一部のエラーが解決できませんでした`);
          }
        } else {
          // 修正に失敗した場合
          await this.notifyProgress(task, `エラーの修正に失敗しました (試行 ${debugAttempts}/${maxDebugRetries})`);
          
          if (debugAttempts >= maxDebugRetries) {
            await this.notifyProgress(task, `最大試行回数 (${maxDebugRetries}) に達しましたが、エラーを修正できませんでした`);
          }
        }
      }
    }
    
    // 5. 最終化フェーズ
    // 最終テストの結果を確認
    const finalTestResult = await this.tester.runTests(task);
    
    if (finalTestResult.success) {
      task.status = ProjectStatus.COMPLETED;
      await this.notifyProgress(task, 'プロジェクトが正常に生成され、テストに合格しました');
    } else {
      // テストは失敗したが、プロジェクトとしては生成完了
      task.status = ProjectStatus.COMPLETED;
      await this.notifyProgress(task, 'プロジェクトは生成されましたが、一部のテストに失敗しました');
    }
    
    // プロジェクトをZIPにアーカイブ
    const zipPath = await this.archiveProject(task);
    
    task.endTime = Date.now();
    
    // 完了メッセージ
    const duration = (task.endTime - task.startTime) / 1000;
    await this.notifyProgress(task, `プロジェクト生成が完了しました (所要時間: ${duration.toFixed(1)}秒)`);
    
    return zipPath;
  }
  
  /**
   * タスクをキャンセル
   * @param taskId タスクID
   */
  public async cancelTask(taskId: string): Promise<boolean> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return false;
    }
    
    task.status = ProjectStatus.CANCELLED;
    task.endTime = Date.now();
    
    await this.notifyProgress(task, 'タスクがキャンセルされました');
    
    // 大きなタスクデータをメモリから解放
    this.activeTasks.delete(taskId);
    
    return true;
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
}