/**
 * 通知サービス
 * 異なるプラットフォームへの通知を抽象化
 */
import { PlatformManager } from '../../platforms/platformManager';
import { MessageContent, NotificationTarget, PlatformType } from '../../platforms/types';
import { logger } from '../../tools/logger';
import { NotificationPayload, NotificationFile } from '../../types/notification';
import { promises as fs } from 'fs';

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
  /**
   * NotificationPayload型に基づき、textのみ・ファイルのみ・text+ファイル送信に対応
   */
  async sendNotification(target: NotificationTarget, payload: NotificationPayload): Promise<string | null> {
    try {
      const messageContent: MessageContent = {};

      if (payload.text) {
        messageContent.text = payload.text;
      }

      if (payload.files && payload.files.length > 0) {
        messageContent.files = [];
        for (const file of payload.files) {
          const buffer = await fs.readFile(file.path);
          messageContent.files.push({
            name: file.name,
            content: buffer
          });
        }
      }

      return await this.platformManager.sendMessage(target, messageContent);
    } catch (error) {
      logger.error(`Failed to send notification to ${target.platformType}:`, error);
      return null;
    }
  }
  
  /**
   * 既存の通知を更新
   */
  /**
   * NotificationPayload型に基づき、既存通知の更新（テキスト・ファイル両対応）
   */
  async updateNotification(target: NotificationTarget, messageId: string, payload: NotificationPayload): Promise<boolean> {
    try {
      const messageContent: MessageContent = {};

      if (payload.text) {
        messageContent.text = payload.text;
      }

      if (payload.files && payload.files.length > 0) {
        messageContent.files = [];
        for (const file of payload.files) {
          const buffer = await fs.readFile(file.path);
          messageContent.files.push({
            name: file.name,
            content: buffer
          });
        }
      }

      return await this.platformManager.updateMessage(target, messageId, messageContent);
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

    const payload: NotificationPayload = {
      text: `**${taskName}** - 進捗状況: ${progressPercentage}%\n${progressBar}\n${details || ''}`
    };

    return await this.updateNotification(target, messageId, payload);
  }
  
  /**
   * エラー通知
   */
  async sendErrorNotification(target: NotificationTarget, errorTitle: string, errorDetails: string): Promise<string | null> {
    const payload: NotificationPayload = {
      text: `⚠️ **エラー: ${errorTitle}**\n\n${errorDetails}\n\n問題が解決しない場合は、システム管理者にお問い合わせください。`
    };

    return await this.sendNotification(target, payload);
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
  async broadcastToAllPlatforms(channelIds: Record<PlatformType, string>, payload: NotificationPayload): Promise<Record<PlatformType, string | null>> {
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
        
        results[platformType] = await this.sendNotification(target, payload);
      }
    }
    
    return results;
  }
}
