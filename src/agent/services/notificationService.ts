/**
 * 通知サービス
 * 異なるプラットフォームへの通知を抽象化
 */
import { PlatformManager } from '../../platforms/platformManager';
import { MessageContent, NotificationTarget, PlatformType } from '../../platforms/types';
import { logger } from '../../tools/logger';

export class NotificationService {
  private platformManager: PlatformManager;
  private static instance: NotificationService;
  
  private constructor() {
    this.platformManager = PlatformManager.getInstance();
  }
  
  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }
  
  /**
   * 指定したターゲットに通知を送信
   */
  async sendNotification(target: NotificationTarget, content: MessageContent): Promise<string | null> {
    try {
      return await this.platformManager.sendMessage(target, content);
    } catch (error) {
      logger.error(`Failed to send notification to ${target.platformType}:`, error);
      return null;
    }
  }
  
  /**
   * 既存の通知を更新
   */
  async updateNotification(target: NotificationTarget, messageId: string, content: MessageContent): Promise<boolean> {
    try {
      return await this.platformManager.updateMessage(target, messageId, content);
    } catch (error) {
      logger.error(`Failed to update notification on ${target.platformType}:`, error);
      return false;
    }
  }
  
  /**
   * タスク進捗の更新通知
   */
  async updateTaskProgress(target: NotificationTarget, messageId: string, taskName: string, progress: number, details?: string): Promise<boolean> {
    const progressBar = this.generateProgressBar(progress);
    const progressPercentage = Math.round(progress * 100);
    
    const content: MessageContent = {
      text: `**${taskName}** - 進捗状況: ${progressPercentage}%\n${progressBar}\n${details || ''}`
    };
    
    return await this.updateNotification(target, messageId, content);
  }
  
  /**
   * エラー通知
   */
  async sendErrorNotification(target: NotificationTarget, errorTitle: string, errorDetails: string): Promise<string | null> {
    const content: MessageContent = {
      text: `⚠️ **エラー: ${errorTitle}**\n\n${errorDetails}\n\n問題が解決しない場合は、システム管理者にお問い合わせください。`
    };
    
    return await this.sendNotification(target, content);
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
   * マルチプラットフォーム対応の通知
   * 全てのアクティブなプラットフォームに同じメッセージを送信
   */
  async broadcastToAllPlatforms(channelIds: Record<PlatformType, string>, content: MessageContent): Promise<Record<PlatformType, string | null>> {
    const results: Record<PlatformType, string | null> = {} as Record<PlatformType, string | null>;
    const adapters = this.platformManager.getAllAdapters();
    
    for (const adapter of adapters) {
      const platformType = adapter.getAdapterType();
      const channelId = channelIds[platformType];
      
      if (channelId) {
        const target: NotificationTarget = {
          userId: '', // ブロードキャストでは不要
          platformType,
          channelId
        };
        
        results[platformType] = await this.sendNotification(target, content);
      }
    }
    
    return results;
  }
}
