/**
 * タスク管理機能
 */
import { v4 as uuidv4 } from 'uuid';
import { NotificationTarget } from '../../platforms/types';
import { NotificationService } from '../services/notificationService';
import { logger } from '../../tools/logger';
import { TaskStatus, FeedbackOptions } from './types';
import { ProjectTask, ProjectStatus, UserFeedback } from '../types';
import { mapProjectStatusToTaskState, calculateProgressFromStatus, generateProgressBar } from '../utils/progressUtils';

export class TaskManager {
  private tasks: Map<string, TaskStatus> = new Map();
  private projectTasks: Map<string, ProjectTask> = new Map();
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = NotificationService.getInstance();
  }

  /**
   * タスク状態の取得
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * ProjectTaskの取得
   */
  getProjectTask(taskId: string): ProjectTask | undefined {
    return this.projectTasks.get(taskId);
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
   * タスク状態の新規作成
   */
  createTaskStatus(taskId: string, description: string): TaskStatus {
    const taskStatus: TaskStatus = {
      id: taskId,
      state: 'planning',
      progress: 0,
      startTime: new Date(),
      description
    };
    
    this.tasks.set(taskId, taskStatus);
    return taskStatus;
  }

  /**
   * ProjectTask オブジェクトの新規作成 
   */
  createProjectTask(taskId: string, spec: string, userId: string, channelId: string, projectPath: string): ProjectTask {
    const projectTask: ProjectTask = {
      id: taskId,
      userId,
      guildId: '',
      channelId,
      specification: spec,
      status: ProjectStatus.PENDING,
      errors: [],
      startTime: Date.now(),
      projectPath,
      lastProgressUpdate: Date.now(),
      feedbackQueue: {
        taskId,
        feedbacks: [],
        lastProcessedIndex: -1
      },
      hasCriticalFeedback: false
    };
    
    this.projectTasks.set(taskId, projectTask);
    return projectTask;
  }

  /**
   * フィードバック処理
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
      taskId,
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
   * タスク進捗の更新
   */
  async updateTaskProgress(
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
    const progressBar = generateProgressBar(progress);
    const progressPercentage = Math.round(progress * 100);
    
    // 通知
    await this.notificationService.sendNotification(target, {
      text: `タスク ${taskId} の進捗状況:\n状態: ${state}\n進捗: ${progressPercentage}%\n${progressBar}\n${description || ''}`
    });
  }

  /**
   * ProjectTaskの状態をTaskStatusに反映
   */
  updateTaskStatusFromProject(taskId: string, message: string): void {
    const projectTask = this.projectTasks.get(taskId);
    const taskStatus = this.tasks.get(taskId);
    
    if (!projectTask || !taskStatus) return;
    
    taskStatus.state = mapProjectStatusToTaskState(projectTask.status);
    taskStatus.progress = calculateProgressFromStatus(projectTask.status);
    taskStatus.description = message;
    
    this.tasks.set(taskId, taskStatus);
  }

  /**
   * タスク完了を設定
   */
  setTaskCompleted(taskId: string, message: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    task.state = 'complete';
    task.progress = 1.0;
    task.endTime = new Date();
    task.description = message;
    
    this.tasks.set(taskId, task);
  }

  /**
   * タスク失敗を設定
   */
  setTaskFailed(taskId: string, error: Error): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    task.state = 'failed';
    task.endTime = new Date();
    task.description = `エラーが発生しました: ${error.message}`;
    
    this.tasks.set(taskId, task);
  }

  /**
   * タスクIDの生成
   */
  generateTaskId(): string {
    return uuidv4().substring(0, 8);
  }
}
