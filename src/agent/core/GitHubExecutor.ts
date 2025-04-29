/**
 * GitHub連携タスク実行機能
 */
import { NotificationTarget } from '../../platforms/types';
import { NotificationService } from '../services/notificationService';
import { logger } from '../../tools/logger';
import { TaskManager } from './TaskManager';

export class GitHubExecutor {
  private notificationService: NotificationService;
  private taskManager: TaskManager;

  constructor(taskManager: TaskManager) {
    this.notificationService = NotificationService.getInstance();
    this.taskManager = taskManager;
  }

  /**
   * GitHub連携タスクの実行
   */
  async executeGitHubTask(taskId: string, repoUrl: string, task: string, target: NotificationTarget): Promise<void> {
    // この実装はサンプルであり、実際の実装ではGitHubサービスと連携します
    try {
      // リポジトリ分析
      await this.taskManager.updateTaskProgress(taskId, 'planning', 0.2, target, 'リポジトリをクローン中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await this.taskManager.updateTaskProgress(taskId, 'planning', 0.5, target, 'リポジトリ構造を分析中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 実装
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.2, target, '機能の実装中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.6, target, 'テストの追加中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // プルリクエスト作成
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.9, target, 'プルリクエストを準備中...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 完了
      this.taskManager.setTaskCompleted(taskId, 'GitHub連携タスクが完了しました');
      
      await this.notificationService.sendNotification(target, {
        text: `GitHub連携タスク ${taskId} が完了しました！\nプルリクエストが作成されました。`
      });
    } catch (error) {
      logger.error(`Error in GitHub task execution ${taskId}:`, error);
      
      this.taskManager.setTaskFailed(taskId, error as Error);
      
      await this.notificationService.sendNotification(target, {
        text: `GitHub連携タスク ${taskId} の実行中にエラーが発生しました: ${(error as Error).message}`
      });
    }
  }
}
