/**
 * エージェントコア
 * 開発プロセス全体のオーケストレーション
 */
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { NotificationTarget, PlatformType } from '../platforms/types';
import { NotificationService } from './services/notificationService';
import { logger } from '../tools/logger';
import { GeminiClient } from '../llm/geminiClient';
import { ConversationMessage, conversationManager } from '../llm/conversationManager';
import { PromptBuilder, PromptType } from '../llm/promptBuilder';
import { ProjectGenerator } from './projectGenerator';
import { Planner } from './planner';
import { Coder } from './coder';
import { Tester } from './tester';
import { Debugger } from './debugger';
import { FeedbackHandler } from './feedbackHandler';
import { config } from '../config/config';
import { getProjectPath } from '../tools/fileSystem';
import { ProjectTask, ProjectStatus, FeedbackQueue, UserFeedback } from './types';

// タスク状態の型定義
export interface TaskStatus {
  id: string;
  state: 'planning' | 'coding' | 'testing' | 'debugging' | 'complete' | 'canceled' | 'failed';
  progress: number;
  startTime: Date;
  endTime?: Date;
  description?: string;
}

// フィードバックオプションの型定義
export interface FeedbackOptions extends NotificationTarget {
  isUrgent?: boolean;
  isFeature?: boolean;
  isFix?: boolean;
  isCode?: boolean;
  filePath?: string;
}

export class AgentCore {
  private tasks: Map<string, TaskStatus> = new Map();
  private projectTasks: Map<string, ProjectTask> = new Map();
  private notificationService: NotificationService;
  private geminiClient: GeminiClient;
  private promptBuilder: PromptBuilder;
  private projectGenerator: ProjectGenerator;
  
  constructor() {
    this.notificationService = NotificationService.getInstance();
    this.geminiClient = new GeminiClient();
    this.promptBuilder = new PromptBuilder();
    
    // 各コンポーネントを初期化
    const planner = new Planner(this.geminiClient, this.promptBuilder);
    const coder = new Coder(this.geminiClient, this.promptBuilder);
    const tester = new Tester();
    const debugger_ = new Debugger(this.geminiClient, this.promptBuilder);
    const feedbackHandler = new FeedbackHandler(planner, coder);
    
    // プロジェクトジェネレーターを初期化
    this.projectGenerator = new ProjectGenerator(planner, coder, tester, debugger_, feedbackHandler);
  }

  /**
   * LLMを使用してユーザーメッセージに応答を生成
   */
  async generateResponse(message: string, target: NotificationTarget): Promise<string> {
    logger.debug(`応答生成開始 - メッセージ: ${message}`);
    
    try {
      // 会話履歴を取得
      const history = conversationManager.getConversationHistory(target.userId, target.channelId);
      logger.debug(`会話履歴エントリ数: ${history?.length || 0}`);
      
      // ユーザーメッセージを会話履歴に追加
      conversationManager.addMessage(
        target.userId,
        target.channelId,
        '', // ギルドIDが不要な場合は空文字列
        message,
        false // ユーザーからのメッセージ
      );
      
      // 特別なキーワードに応じたダミー応答
      // 始めはダミー実装を維持（API連携までの移行期間用）
      if (message.toLowerCase().includes('help') || message.toLowerCase().includes('ヘルプ')) {
        logger.debug(`ヘルプキーワードを検出しました`);
        const helpResponse = `ERIASへようこそ！以下のコマンドが利用可能です：

/help - このヘルプメッセージを表示
/newproject [仕様] - 新しいプロジェクトを開始
/status [taskID] - タスクの状態を確認
/cancel [taskID] - タスクをキャンセル
/githubrepo [URL] [タスク] - GitHubリポジトリに機能を追加`;
        
        // 会話履歴にアシスタントの応答を追加
        conversationManager.addMessage(
          target.userId,
          target.channelId,
          '',
          helpResponse,
          true // アシスタントからのメッセージ
        );
        
        return helpResponse;
      }
      
      try {
        // システムプロンプトを取得
        const systemPrompt = this.promptBuilder.getTemplate(PromptType.CONVERSATION) || 
          `あなたはERIAS、自律型AI開発エージェントです。ユーザーが質問したり会話したりしたいときは、丁寧で友好的な応答をします。スラッシュコマンドについて説明することもできます。`;
        
        logger.debug(`Gemini APIリクエスト開始`);
        
        // LLMを使って実際に応答を生成
        const response = await this.geminiClient.generateContent(
          message,
          systemPrompt,
          0.7, // temperature
          30000, // timeout
          history
        );
        
        logger.debug(`Gemini APIレスポンス受信: ${response.substring(0, 100)}...`);
        
        // 会話履歴にアシスタントの応答を追加
        conversationManager.addMessage(
          target.userId,
          target.channelId,
          '',
          response,
          true // アシスタントからのメッセージ
        );
        
        return response;
      } catch (llmError) {
        logger.error(`Gemini API error: ${(llmError as Error).message}`);
        if (llmError instanceof Error && llmError.stack) {
          logger.error(`エラースタック: ${llmError.stack}`);
        }
        
        // APIエラーが発生した場合はフォールバックメッセージ
        const fallbackResponse = `すみません、応答の生成中に問題が発生しました。直接コマンドを使用してみてください：
/help - 利用可能なコマンドを表示`;
        
        // エラーメッセージも会話履歴に追加
        conversationManager.addMessage(
          target.userId,
          target.channelId,
          '',
          fallbackResponse,
          true
        );
        
        return fallbackResponse;
      }
    } catch (error) {
      logger.error(`Error in generateResponse: ${(error as Error).message}`);
      if (error instanceof Error && error.stack) {
        logger.error(`エラースタック: ${error.stack}`);
      }
      return `すみません、エラーが発生しました。しばらくしてから再度お試しください。`;
    }
  }

  /**
   * 新規プロジェクト作成の開始
   */
  async startNewProject(spec: string, target: NotificationTarget): Promise<string> {
    // UUIDベースのタスクID生成
    const taskId = uuidv4().substring(0, 8);
    logger.info(`Starting new project with ID: ${taskId}`);
    
    // 基本的なタスク状態の初期化（AgentCore内部用）
    const taskStatus: TaskStatus = {
      id: taskId,
      state: 'planning',
      progress: 0,
      startTime: new Date(),
      description: '計画立案を開始中...'
    };
    
    this.tasks.set(taskId, taskStatus);
    
    // プロジェクトディレクトリのパスを作成
    const projectPath = path.join(config.PROJECTS_DIR || './projects', taskId);

    try {
      // ディレクトリが存在しない場合は作成
      await fs.mkdir(projectPath, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create project directory: ${projectPath}`, error);
      throw new Error(`プロジェクトディレクトリの作成に失敗しました: ${(error as Error).message}`);
    }
    
    // ProjectTask オブジェクトの作成（ProjectGenerator用）
    const projectTask: ProjectTask = {
      id: taskId,
      userId: target.userId,
      guildId: '', // DiscordのguildIdまたはSlackのworkspaceId
      channelId: target.channelId,
      specification: spec,
      status: ProjectStatus.PENDING,
      errors: [],
      startTime: Date.now(),
      projectPath: projectPath,
      lastProgressUpdate: Date.now(),
      feedbackQueue: {
        taskId: taskId,
        feedbacks: [],
        lastProcessedIndex: -1
      },
      hasCriticalFeedback: false
    };
    
    // タスクをマップに保存
    this.projectTasks.set(taskId, projectTask);
    
    // 通知
    await this.notificationService.sendNotification(target, {
      text: `プロジェクト作成タスク（ID: ${taskId}）を開始しました。\n仕様：${spec}\n\n初期状態：計画立案フェーズ`
    });
    
    // 非同期でプロジェクト生成実行
    this.executeProjectGeneration(taskId, target).catch(error => {
      logger.error(`Error executing project generation ${taskId}:`, error);
    });
    
    return taskId;
  }

  /**
   * GitHub連携タスクの開始
   */
  async startGitHubTask(repoUrl: string, task: string, target: NotificationTarget): Promise<string> {
    const taskId = this.generateTaskId();
    
    // タスク状態の初期化
    const taskStatus: TaskStatus = {
      id: taskId,
      state: 'planning',
      progress: 0,
      startTime: new Date(),
      description: 'GitHubリポジトリの分析中...'
    };
    
    this.tasks.set(taskId, taskStatus);
    
    // 通知
    await this.notificationService.sendNotification(target, {
      text: `GitHub連携タスク（ID: ${taskId}）を開始しました。\nリポジトリ：${repoUrl}\nタスク：${task}\n\n初期状態：リポジトリ分析フェーズ`
    });
    
    // 非同期でGitHubタスク実行
    this.executeGitHubTask(taskId, repoUrl, task, target).catch(error => {
      logger.error(`Error executing GitHub task ${taskId}:`, error);
    });
    
    return taskId;
  }

  /**
   * 画像生成
   */
  async generateImage(prompt: string, target: NotificationTarget): Promise<Buffer | null> {
    logger.info(`Generating image for prompt: ${prompt}`);
    
    try {
      // TODO: 実際の画像生成ロジックを実装
      // これはプレースホルダー実装です
      // await new Promise(resolve => setTimeout(resolve, 2000)); // 生成時間をシミュレート
      
      // ダミー画像を返す（実際の実装では、Gemini APIを使用）
      return Buffer.from('dummy image data');
    } catch (error) {
      logger.error(`Error generating image: ${error}`);
      return null;
    }
  }

  /**
   * タスク状態の取得
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * タスクのキャンセル
   */
  async cancelTask(taskId: string, userId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    // 完了済みタスクはキャンセル不可
    if (task.state === 'complete' || task.state === 'canceled' || task.state === 'failed') {
      return false;
    }
    
    // タスク状態を更新
    task.state = 'canceled';
    task.endTime = new Date();
    task.description = `ユーザー ${userId} によってキャンセルされました`;
    
    this.tasks.set(taskId, task);
    return true;
  }

  /**
   * タスクへのフィードバック処理
   */
  async processFeedback(taskId: string, feedback: string, options: FeedbackOptions): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    // 完了済みタスクにはフィードバック不可
    if (task.state === 'complete' || task.state === 'canceled' || task.state === 'failed') {
      await this.notificationService.sendNotification(options, {
        text: `タスク ${taskId} は既に ${task.state} 状態のため、フィードバックを適用できません。`
      });
      return false;
    }
    
    // フィードバックのログ記録
    logger.info(`Feedback received for task ${taskId}: ${feedback}`, {
      isUrgent: options.isUrgent,
      isFeature: options.isFeature,
      isFix: options.isFix,
      isCode: options.isCode,
      filePath: options.filePath
    });
    
    // フィードバック処理の通知
    await this.notificationService.sendNotification(options, {
      text: `タスク ${taskId} へのフィードバックを処理中...`
    });
    
    // ProjectTask オブジェクトとフィードバックキューの取得
    const projectTask = this.projectTasks.get(taskId);
    if (!projectTask) {
      logger.error(`ProjectTask object not found for task ${taskId}`);
      return false;
    }
    
    // フィードバックオブジェクトの作成
    const userFeedback: UserFeedback = {
      id: uuidv4(),
      taskId: taskId,
      timestamp: Date.now(),
      content: feedback,
      priority: options.isUrgent ? 'high' : 'normal',
      urgency: options.isUrgent ? 'critical' : 'normal',
      type: options.isFeature ? 'feature' : 
            options.isFix ? 'fix' : 
            options.isCode ? 'code' : 'general',
      targetFile: options.filePath,
      status: 'pending'
    };
    
    // フィードバックキューに追加
    projectTask.feedbackQueue.feedbacks.push(userFeedback);
    if (options.isUrgent) {
      projectTask.hasCriticalFeedback = true;
    }
    
    this.projectTasks.set(taskId, projectTask);
    
    await this.notificationService.sendNotification(options, {
      text: `タスク ${taskId} にフィードバックを追加しました。フィードバックは次の適切なタイミングで処理されます。`
    });
    
    return true;
  }

  /**
   * タスクIDの生成
   */
  private generateTaskId(): string {
    return uuidv4().substring(0, 8);
  }

  /**
   * プロジェクト生成の実行（実際のProjectGeneratorを使用）
   */
  private async executeProjectGeneration(taskId: string, target: NotificationTarget): Promise<void> {
    logger.info(`Executing project generation for task ${taskId}`);
    
    const projectTask = this.projectTasks.get(taskId);
    if (!projectTask) {
      logger.error(`ProjectTask not found for task ${taskId}`);
      return;
    }
    
    try {
      // 進捗通知関数
      const notifyProgress = async (task: ProjectTask, message: string): Promise<void> => {
        logger.debug(`Progress update for task ${task.id}: ${message}`);
        
        // タスク状態の更新
        const taskStatus = this.tasks.get(task.id);
        if (taskStatus) {
          taskStatus.state = this.mapProjectStatusToTaskState(task.status);
          taskStatus.progress = this.calculateProgressFromStatus(task.status);
          taskStatus.description = message;
          this.tasks.set(task.id, taskStatus);
        }
        
        // 通知送信
        await this.notificationService.sendNotification(target, { text: message });
      };
      
      // ProjectGeneratorを使用してプロジェクト生成を実行
      const zipPath = await this.projectGenerator.executeProjectGeneration(projectTask, notifyProgress);
      
      // タスク状態の更新
      const taskStatus = this.tasks.get(taskId);
      if (taskStatus) {
        taskStatus.state = 'complete';
        taskStatus.progress = 1.0;
        taskStatus.endTime = new Date();
        taskStatus.description = 'プロジェクト生成が完了しました';
        this.tasks.set(taskId, taskStatus);
      }
      
      // 完了通知
      await this.notificationService.sendNotification(target, {
        text: `タスク ${taskId} が完了しました！\n生成されたプロジェクトは次のパスにあります：${zipPath}`
      });
    } catch (error) {
      logger.error(`Error in project generation for task ${taskId}:`, error);
      
      // エラー状態の更新
      const taskStatus = this.tasks.get(taskId);
      if (taskStatus) {
        taskStatus.state = 'failed';
        taskStatus.endTime = new Date();
        taskStatus.description = `エラーが発生しました: ${(error as Error).message}`;
        this.tasks.set(taskId, taskStatus);
      }
      
      // エラー通知
      await this.notificationService.sendNotification(target, {
        text: `タスク ${taskId} の実行中にエラーが発生しました: ${(error as Error).message}`
      });
    }
  }

  /**
   * GitHub連携タスクの実行（非同期、バックグラウンド処理）
   */
  private async executeGitHubTask(taskId: string, repoUrl: string, task: string, target: NotificationTarget): Promise<void> {
    // この実装はサンプルであり、実際の実装ではGitHubサービスと連携します
    try {
      // リポジトリ分析
      await this.updateTaskProgress(taskId, 'planning', 0.2, target, 'リポジトリをクローン中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await this.updateTaskProgress(taskId, 'planning', 0.5, target, 'リポジトリ構造を分析中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 実装
      await this.updateTaskProgress(taskId, 'coding', 0.2, target, '機能の実装中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await this.updateTaskProgress(taskId, 'coding', 0.6, target, 'テストの追加中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // プルリクエスト作成
      await this.updateTaskProgress(taskId, 'coding', 0.9, target, 'プルリクエストを準備中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 完了
      const task = this.tasks.get(taskId);
      if (task) {
        task.state = 'complete';
        task.progress = 1.0;
        task.endTime = new Date();
        task.description = 'GitHub連携タスクが完了しました';
        
        this.tasks.set(taskId, task);
        
        await this.notificationService.sendNotification(target, {
          text: `GitHub連携タスク ${taskId} が完了しました！\nプルリクエストが作成されました。`
        });
      }
    } catch (error) {
      logger.error(`Error in GitHub task execution ${taskId}:`, error);
      
      const task = this.tasks.get(taskId);
      if (task) {
        task.state = 'failed';
        task.endTime = new Date();
        task.description = `エラーが発生しました: ${(error as Error).message}`;
        
        this.tasks.set(taskId, task);
        
        await this.notificationService.sendNotification(target, {
          text: `GitHub連携タスク ${taskId} の実行中にエラーが発生しました: ${(error as Error).message}`
        });
      }
    }
  }

  /**
   * タスク進捗の更新
   */
  private async updateTaskProgress(
    taskId: string, 
    state: TaskStatus['state'], 
    progress: number, 
    target: NotificationTarget, 
    description?: string
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    task.state = state;
    task.progress = progress;
    task.description = description || task.description;
    
    this.tasks.set(taskId, task);
    
    // プログレスバーを生成
    const progressBar = this.generateProgressBar(progress);
    const progressPercentage = Math.round(progress * 100);
    
    // 通知
    await this.notificationService.sendNotification(target, {
      text: `タスク ${taskId} の進捗状況:\n状態: ${state}\n進捗: ${progressPercentage}%\n${progressBar}\n${description || ''}`
    });
  }

  /**
   * プログレスバーの生成
   */
  private generateProgressBar(progress: number, length: number = 20): string {
    const filledLength = Math.round(length * progress);
    const emptyLength = length - filledLength;
    
    const filledPart = '█'.repeat(filledLength);
    const emptyPart = '░'.repeat(emptyLength);
    
    return `[${filledPart}${emptyPart}]`;
  }
  
  /**
   * ProjectStatusからTaskStatusの状態への変換
   */
  private mapProjectStatusToTaskState(status: ProjectStatus): TaskStatus['state'] {
    switch (status) {
      case ProjectStatus.PENDING:
      case ProjectStatus.PLANNING:
        return 'planning';
      case ProjectStatus.CODING:
        return 'coding';
      case ProjectStatus.TESTING:
        return 'testing';
      case ProjectStatus.DEBUGGING:
        return 'debugging';
      case ProjectStatus.COMPLETED:
        return 'complete';
      case ProjectStatus.FAILED:
        return 'failed';
      case ProjectStatus.CANCELLED:
        return 'canceled';
      default:
        return 'planning';
    }
  }
  
  /**
   * ProjectStatusから進捗率の計算
   */
  private calculateProgressFromStatus(status: ProjectStatus): number {
    switch (status) {
      case ProjectStatus.PENDING:
        return 0.0;
      case ProjectStatus.PLANNING:
        return 0.2;
      case ProjectStatus.CODING:
        return 0.5;
      case ProjectStatus.TESTING:
        return 0.8;
      case ProjectStatus.DEBUGGING:
        return 0.9;
      case ProjectStatus.COMPLETED:
        return 1.0;
      case ProjectStatus.FAILED:
      case ProjectStatus.CANCELLED:
        return 1.0;
      default:
        return 0.0;
    }
  }
}