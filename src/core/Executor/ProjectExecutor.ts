/**
 * プロジェクト実行機能
 */
import path from 'path';
import { NotificationTarget } from '../../types/agentTypes';
import { NotificationService } from '../notificationService';
import { ProjectGenerator } from '../../modules/projectGenerator';
import logger from '../../utils/logger';
import { logError } from '../../utils/logger';
import { TaskManager } from '../TaskManager';
import { ProgressNotifier } from '../types';
import { ProjectTask } from '../types';

export class ProjectExecutor {
  private notificationService: NotificationService;
  private projectGenerator: ProjectGenerator;
  private taskManager: TaskManager;

  constructor(
    projectGenerator: ProjectGenerator,
    taskManager: TaskManager
  ) {
    this.notificationService = NotificationService.getInstance();
    this.projectGenerator = projectGenerator;
    this.taskManager = taskManager;
  }

  /**
   * プロジェクト生成の実行
   */
  async executeProjectGeneration(taskId: string, target: NotificationTarget): Promise<void> {
    logger.info(`Executing project generation for task ${taskId}`);
    
    const projectTask = this.taskManager.getProjectTask(taskId);
    if (!projectTask) {
      logError(`ProjectTask not found for task ${taskId}`);
      return;
    }
    
    try {
      // 進捗通知関数
      const notifyProgress = this.createProgressNotifier(target);
      
      // ProjectGeneratorを使用してプロジェクト生成を実行
      const zipPath = await this.projectGenerator.executeProjectGeneration(projectTask, notifyProgress);
      
      // タスク状態の更新
      this.taskManager.setTaskCompleted(taskId, 'プロジェクト生成が完了しました');
      
      // 完了通知
      await this.notificationService.sendNotification(target, {
        text: `タスク ${taskId} が完了しました！\n生成されたプロジェクトは次のパスにあります：${zipPath}`,
        files: [{ path: zipPath, name: path.basename(zipPath), mimeType: 'application/zip' }]
      });
    } catch (error) {
      logError(`Error in project generation for task ${taskId}: ${(error as Error).message}`);
      
      // エラー状態の更新
      this.taskManager.setTaskFailed(taskId, error as Error);
      
      // エラー通知
      await this.notificationService.sendNotification(target, {
        text: `タスク ${taskId} の実行中にエラーが発生しました: ${(error as Error).message}`
      });
    }
  }

  /**
   * 進捗通知関数を作成
   */
  private createProgressNotifier(target: NotificationTarget): ProgressNotifier {
    return async (task: ProjectTask, message: string): Promise<void> => {
      logger.debug(`Progress update for task ${task.id}: ${message}`);
      
      // タスク状態の更新
      this.taskManager.updateTaskStatusFromProject(task.id, message);
      
      // 通知送信
      await this.notificationService.sendNotification(target, { text: message });
    };
  }
}
