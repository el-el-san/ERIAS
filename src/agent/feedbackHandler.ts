import { 
  ProjectTask, 
  UserFeedback,
  ProjectStatus,
  FileInfo
} from './types';
import { Planner } from './planner';
import { Coder } from './coder';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger';

/**
 * フィードバック処理クラス
 * フィードバックの処理とコードの再生成を担当
 */
export class FeedbackHandler {
  private planner: Planner;
  private coder: Coder;
  
  constructor(planner: Planner, coder: Coder) {
    this.planner = planner;
    this.coder = coder;
  }
  
  /**
   * キューに溜まっているフィードバックを処理
   * @param task プロジェクトタスク
   * @param context 現在のコンテキスト
   * @param notifyProgressFn 進捗通知関数
   */
  public async processQueuedFeedbacks(
    task: ProjectTask, 
    context: string,
    notifyProgressFn: (task: ProjectTask, message: string) => Promise<void>
  ): Promise<void> {
    const queue = task.feedbackQueue;
    const pendingFeedbacks = queue.feedbacks.slice(queue.lastProcessedIndex);
    
    if (pendingFeedbacks.length === 0) {
      return;
    }
    
    await notifyProgressFn(task, `${context}フェーズで ${pendingFeedbacks.length}件の追加指示を処理します...`);
    
    // 全ての保留中フィードバックを統合して処理
    const combinedFeedback = pendingFeedbacks
      .map((f, i) => `${i+1}. ${f.content}`)
      .join('\n');
    
    const processingPrompt = `
次の${context}フェーズを実行する前に、ユーザーから以下の追加指示が来ています:

${combinedFeedback}

これらの指示を考慮して${context}を行ってください。
    `;
    
    // フェーズごとの処理にプロンプトを追加
    task.additionalInstructions = processingPrompt;
    
    // 処理済みとしてマーク
    queue.lastProcessedIndex = queue.feedbacks.length;
    
    for (const feedback of pendingFeedbacks) {
      feedback.status = 'processing';
    }
  }
  
  /**
   * 緊急フィードバックを処理
   * @param task プロジェクトタスク
   * @param notifyProgressFn 進捗通知関数
   */
  public async processCriticalFeedbacks(
    task: ProjectTask,
    notifyProgressFn: (task: ProjectTask, message: string) => Promise<void>
  ): Promise<void> {
    const queue = task.feedbackQueue;
    const criticalFeedbacks = queue.feedbacks
      .filter(f => f.status === 'pending' && f.urgency === 'critical');
    
    if (criticalFeedbacks.length === 0) {
      return;
    }
    
    // 現在のフェーズ
    const currentPhase = task.status;
    
    // 緊急フィードバックの内容を統合
    const combinedFeedback = criticalFeedbacks
      .map((f, i) => `${i+1}. ${f.content}`)
      .join('\n');
    
    await notifyProgressFn(task, `${criticalFeedbacks.length}件の緊急指示を処理中...`);
    
    // 現在のフェーズに応じた処理
    if (currentPhase === ProjectStatus.TESTING) {
      // テスト中の場合は、次のステップのための再計画を実施
      
      // テスト結果を考慮した計画修正プロンプト
      const processingPrompt = `
現在のプロジェクトはテストフェーズにありますが、ユーザーから以下の緊急指示が来ています:

${combinedFeedback}

以下の点を考慮して、既存の計画を調整してください:
1. テスト結果を考慮する
2. 既に生成されたコードをできるだけ活かす
3. 緊急指示の内容を反映する

何を変更すべきか、どのファイルを修正・追加すべきか具体的に説明してください。
      `;
      
      // フィードバックに基づく再計画
      const updatedPlan = await this.planner.refactorPlan(task, processingPrompt);
      if (updatedPlan && task.plan) {
        // 更新された計画を既存の計画とマージ
        task.plan = {
          ...task.plan,
          ...updatedPlan,
          files: [...task.plan.files]
        };
        
        // ファイルの更新フラグを設定
        for (const file of updatedPlan.files) {
          const existingFile = task.plan.files.find(f => f.path === file.path);
          if (existingFile) {
            existingFile.needsUpdate = true;
          } else {
            task.plan.files.push({
              ...file,
              status: 'pending'
            });
          }
        }
      }
      
      // 緊急フィードバックを処理済みとしてマーク
      for (const feedback of criticalFeedbacks) {
        feedback.status = 'applied';
        feedback.appliedPhase = 'testing';
      }
      
      // テスト後の再コーディングが必要ならフラグを設定
      task.requiresRecoding = true;
      
      await notifyProgressFn(task, '緊急指示に基づいて計画を調整しました。テスト完了後に必要な修正を行います。');
    } else if (currentPhase === ProjectStatus.CODING) {
      // コーディング中の場合、フィードバックをコンテキストに追加
      if (!task.currentContextualFeedback) {
        task.currentContextualFeedback = [];
      }
      
      for (const feedback of criticalFeedbacks) {
        task.currentContextualFeedback.push(feedback.content);
        feedback.status = 'applied';
        feedback.appliedPhase = 'coding';
      }
      
      await notifyProgressFn(task, '緊急指示を現在のコーディングコンテキストに追加しました。');
    } else {
      // その他のフェーズでは次のフェーズで処理するようにマーク
      task.hasCriticalFeedback = true;
      await notifyProgressFn(task, `緊急指示を受け付けました。${currentPhase}フェーズ完了後に処理します。`);
    }
  }
  
  /**
   * フィードバックに基づく再コーディング処理
   * @param task プロジェクトタスク
   * @param notifyProgressFn 進捗通知関数
   */
  public async recodeBasedOnFeedback(
    task: ProjectTask,
    notifyProgressFn: (task: ProjectTask, message: string) => Promise<void>
  ): Promise<void> {
    if (!task.plan) {
      logger.error('No plan available for recoding');
      return;
    }
    
    // 計画から変更が必要なファイルを特定
    const filesToRecode = task.plan.files.filter(file => file.needsUpdate);
    
    for (let i = 0; i < filesToRecode.length; i++) {
      const fileInfo = filesToRecode[i];
      await notifyProgressFn(task, `ファイルを再生成中 (${i+1}/${filesToRecode.length}): ${fileInfo.path}`);
      
      try {
        // 既存ファイルの内容を取得（存在する場合）
        let existingContent = '';
        try {
          existingContent = await fs.readFile(path.join(task.projectPath, fileInfo.path), 'utf8');
        } catch (err) {
          // ファイルが存在しない場合は無視
        }
        
        // フィードバックと既存コードを考慮した再生成
        const content = await this.coder.regenerateFile(task, fileInfo, existingContent);
        fileInfo.content = content;
        fileInfo.status = 'updated';
        
        // 更新されたファイルを保存
        const filePath = path.join(task.projectPath, fileInfo.path);
        const fileDir = path.dirname(filePath);
        await fs.mkdir(fileDir, { recursive: true });
        await fs.writeFile(filePath, content);
      } catch (error) {
        logger.error(`Error regenerating file ${fileInfo.path}: ${(error as Error).message}`);
        fileInfo.status = 'error';
      }
    }
    
    // 新しいファイルの追加
    const newFiles = task.plan.files.filter(file => file.status === 'pending' && !file.content);
    
    for (let i = 0; i < newFiles.length; i++) {
      const fileInfo = newFiles[i];
      await notifyProgressFn(task, `新しいファイルを生成中 (${i+1}/${newFiles.length}): ${fileInfo.path}`);
      
      try {
        const content = await this.coder.generateFile(task, fileInfo);
        fileInfo.content = content;
        fileInfo.status = 'generated';
        
        // 新しいファイルを保存
        const filePath = path.join(task.projectPath, fileInfo.path);
        const fileDir = path.dirname(filePath);
        await fs.mkdir(fileDir, { recursive: true });
        await fs.writeFile(filePath, content);
      } catch (error) {
        logger.error(`Error generating new file ${fileInfo.path}: ${(error as Error).message}`);
        fileInfo.status = 'error';
      }
    }
    
    // 依存関係の更新が必要な場合
    if (task.plan.requiresDependencyUpdate) {
      await notifyProgressFn(task, '依存関係を更新中...');
      await this.coder.installDependencies(task);
    }
  }
}