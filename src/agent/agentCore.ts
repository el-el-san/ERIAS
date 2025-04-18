import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  ProjectTask,
  ProjectStatus,
  ProgressListener,
  FeedbackPriority,
  FeedbackUrgency,
  FeedbackType,
  UserFeedback
} from './types';
import { Planner } from './planner';
import { Coder } from './coder';
import { Tester } from './tester';
import { Debugger } from './debugger';
import logger from '../utils/logger';
import config from '../config/config';
import { getProjectPath } from '../tools/fileSystem';
import { withTimeout } from '../utils/asyncUtils';
import { FeedbackHandler } from './feedbackHandler';
import { ProjectGenerator } from './projectGenerator';

/**
 * エージェントコア
 * 全体のオーケストレーションを行う
 */
export class AgentCore {
  private planner: Planner;
  private coder: Coder;
  private tester: Tester;
  private debugger: Debugger;
  private feedbackHandler: FeedbackHandler;
  private projectGenerator: ProjectGenerator;
  private progressListeners: ProgressListener[] = [];
  private activeTasks: Map<string, ProjectTask> = new Map();
  private pendingFeedbackRequests: Map<string, { resolve: (feedback: string | null) => void, timeoutHandler: NodeJS.Timeout }> = new Map();
  
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
    this.feedbackHandler = new FeedbackHandler(this.planner, this.coder);
    this.projectGenerator = new ProjectGenerator(
      this.planner,
      this.coder,
      this.tester,
      this.debugger,
      this.feedbackHandler
    );
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
  public async notifyProgress(task: ProjectTask, message: string): Promise<void> {
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
      feedbackQueue: {
        taskId,
        feedbacks: [],
        lastProcessedIndex: 0
      },
      hasCriticalFeedback: false,
      currentContextualFeedback: []
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
        this.projectGenerator.executeProjectGeneration(task, this.notifyProgress.bind(this)),
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
   * ユーザーフィードバックをキューに追加
   * @param taskId タスクID
   * @param userId ユーザーID
   * @param content フィードバック内容
   * @param priority 優先度
   * @param urgency 緊急度
   * @param type フィードバックタイプ
   * @param targetFile 対象ファイル
   */
  public async queueUserFeedback(
    taskId: string,
    userId: string,
    content: string,
    priority: FeedbackPriority = 'normal',
    urgency: FeedbackUrgency = 'normal',
    type: FeedbackType = 'general',
    targetFile?: string
  ): Promise<boolean> {
    const task = this.getTask(taskId);
    
    if (!task || task.userId !== userId) {
      return false;
    }
    
    const feedback: UserFeedback = {
      id: uuidv4(),
      taskId,
      timestamp: Date.now(),
      content,
      priority,
      urgency,
      type,
      targetFile,
      status: 'pending'
    };
    
    // キューに追加
    if (priority === 'high') {
      task.feedbackQueue.feedbacks.unshift(feedback);
    } else {
      task.feedbackQueue.feedbacks.push(feedback);
    }
    
    // 緊急フィードバックの場合はフラグを立てる
    if (urgency === 'critical') {
      task.hasCriticalFeedback = true;
      
      // 現在実行中のフェーズに応じたメッセージを表示
      let interruptMessage = `⚠️ 緊急の指示を受け付けました: "${content}"`;
      
      if (task.status === ProjectStatus.TESTING) {
        interruptMessage += "\nテスト完了後、再計画を検討します。";
      } else if (task.status === ProjectStatus.CODING) {
        interruptMessage += "\n現在のファイル生成完了後、変更を適用します。";
      }
      
      await this.notifyProgress(task, interruptMessage);
    } else {
      await this.notifyProgress(task, `新しい指示をキューに追加しました: "${content}"`);
    }
    
    // フィードバック待ちのリクエストがあれば応答
    const pendingRequest = this.pendingFeedbackRequests.get(taskId);
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeoutHandler);
      pendingRequest.resolve(content);
      this.pendingFeedbackRequests.delete(taskId);
    }
    
    return true;
  }
  
  /**
   * ユーザーフィードバックの処理状態を変更
   * @param taskId タスクID
   * @param feedbackId フィードバックID
   * @param status 新しい状態
   * @param appliedPhase 適用されたフェーズ
   */
  public updateFeedbackStatus(
    taskId: string,
    feedbackId: string,
    status: 'pending' | 'processing' | 'applied' | 'rejected',
    appliedPhase?: string
  ): boolean {
    const task = this.getTask(taskId);
    if (!task) return false;
    
    const feedback = task.feedbackQueue.feedbacks.find(f => f.id === feedbackId);
    if (!feedback) return false;
    
    feedback.status = status;
    if (appliedPhase) {
      feedback.appliedPhase = appliedPhase;
    }
    
    return true;
  }
  
  /**
   * ユーザー入力待機
   * @param task プロジェクトタスク
   * @param timeout タイムアウト時間(ms)
   */
  private async waitForUserFeedback(task: ProjectTask, timeout: number): Promise<string | null> {
    return new Promise<string | null>(resolve => {
      // タイムアウトハンドラ
      const timeoutHandler = setTimeout(() => {
        this.pendingFeedbackRequests.delete(task.id);
        resolve(null);
      }, timeout);
      
      // このタスクのフィードバック要求を登録
      this.pendingFeedbackRequests.set(task.id, {
        resolve,
        timeoutHandler
      });
    });
  }
}
