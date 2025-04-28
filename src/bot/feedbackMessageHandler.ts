/**
 * フィードバックメッセージハンドラー
 * プラットフォーム共通のメッセージ処理を行う
 */
import { PlatformMessage, PlatformType } from '../platforms/types';
import { PlatformManager } from '../platforms/platformManager';
import { AgentCore } from '../agent/agentCore';
import { logger } from '../tools/logger';
import { ImageRequestDetector } from '../generators/imageRequestDetector';
import { ConversationMessage, conversationManager } from '../llm/conversationManager';

export class FeedbackMessageHandler {
  private agentCore: AgentCore;
  private platformManager: PlatformManager;
  private imageRequestDetector: ImageRequestDetector;
  
  constructor(agentCore: AgentCore) {
    this.agentCore = agentCore;
    this.platformManager = PlatformManager.getInstance();
    this.imageRequestDetector = new ImageRequestDetector();
  }

  /**
   * メッセージを処理
   */
  async handleMessage(message: PlatformMessage): Promise<void> {
    try {
      // タスクへのフィードバックがないか確認
      const taskIdMatch = message.content.match(/task:(\w+)/i);
      if (taskIdMatch) {
        await this.handleTaskFeedback(message, taskIdMatch[1]);
        return;
      }
      
      // 画像生成リクエストの検出
      const imagePrompt = this.imageRequestDetector.detectImageRequest(message);
      if (imagePrompt) {
        await this.handleImageRequest(message, imagePrompt);
        return;
      }
      
      // 通常会話の処理
      await this.handleConversation(message);
    } catch (error) {
      logger.error('Error handling message:', error);
      
      // エラー応答
      const adapter = this.platformManager.getAdapter(message.platformType);
      if (adapter) {
        await adapter.sendMessage(message.channelId, {
          text: `メッセージの処理中にエラーが発生しました：${(error as Error).message}`
        });
      }
    }
  }

  /**
   * 通常会話の処理
   */
  private async handleConversation(message: PlatformMessage): Promise<void> {
    try {
      // 詳細ログ追加
      logger.debug(`会話メッセージ受信 (${message.platformType}) - 内容: ${message.content}`);
      logger.debug(`メッセージ情報 - チャンネル: ${message.channelId}, ユーザー: ${message.author.id}`);
      console.log(`会話メッセージ受信: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`);
      
      // メッセージが空の場合は対応しない
      if (!message.content.trim()) {
        logger.debug('空のメッセージのため処理をスキップ');
        return;
      }

      // アダプター取得
      const adapter = this.platformManager.getAdapter(message.platformType);
      
      if (!adapter) {
        logger.error(`プラットフォームタイプ ${message.platformType} のアダプターが見つかりません`);
        return;
      }
      
      // デバッグ用の応答を先に送信
      await adapter.sendMessage(message.channelId, {
        text: `デバッグ: メッセージを受信し、処理中です: "${message.content}"`
      });
      
      // LLMを使用して応答を生成
      try {
        logger.debug('応答生成を開始');
        // Gemini APIを使用して応答を生成
        const response = await this.agentCore.generateResponse(message.content, {
          userId: message.author.id,
          platformType: message.author.platformType,
          channelId: message.channelId
        });
        
        logger.debug(`応答生成が完了しました: ${response?.substring(0, 100)}...`);
        
        // 応答を送信
        await adapter.sendMessage(message.channelId, {
          text: response || `すみません、応答の生成中に問題が発生しました。`
        });
      } catch (error) {
        logger.error(`LLM応答生成中にエラーが発生しました:`, error);
        // エラー詳細をログに記録
        if (error instanceof Error) {
          logger.error(`エラー詳細: ${error.message}\n${error.stack}`);
        }
        await adapter.sendMessage(message.channelId, {
          text: `すみません、応答の生成中に問題が発生しました: ${(error as Error).message}`
        });
      }
    } catch (error) {
      logger.error('Error handling conversation:', error);
      // 全体エラーの詳細をログに記録
      if (error instanceof Error) {
        logger.error(`会話処理エラー詳細: ${error.message}\n${error.stack}`);
      }
    }
  }

  /**
   * タスクフィードバックの処理
   */
  private async handleTaskFeedback(message: PlatformMessage, taskId: string): Promise<void> {
    // フィードバック内容の抽出（task:タスクID を除去）
    const feedback = message.content.replace(/task:\w+/i, '').trim();
    
    if (!feedback) {
      const adapter = this.platformManager.getAdapter(message.platformType);
      if (adapter) {
        await adapter.sendMessage(message.channelId, {
          text: `タスク${taskId}へのフィードバックが空です。\`task:${taskId} [指示内容]\` の形式で送信してください。`
        });
      }
      return;
    }
    
    // 特殊タグの検出
    const isUrgent = /#urgent|#緊急/i.test(message.content);
    const isFeature = /#feature|#機能/i.test(message.content);
    const isFix = /#fix|#修正/i.test(message.content);
    const isCode = /#code|#コード/i.test(message.content);
    
    // ファイル特定のタグ検出
    const filePathMatch = message.content.match(/file:([^\s]+)/i);
    const filePath = filePathMatch ? filePathMatch[1] : undefined;
    
    // フィードバック処理をAgentCoreに委譲
    try {
      await this.agentCore.processFeedback(taskId, feedback, {
        userId: message.author.id,
        platformType: message.author.platformType,
        channelId: message.channelId,
        isUrgent,
        isFeature,
        isFix,
        isCode,
        filePath
      });
      
      // 処理開始メッセージを送信
      const adapter = this.platformManager.getAdapter(message.platformType);
      if (adapter) {
        await adapter.sendMessage(message.channelId, {
          text: `タスク${taskId}へのフィードバックを受け付けました。処理を開始します。`
        });
      }
    } catch (error) {
      logger.error(`Failed to process feedback for task ${taskId}:`, error);
      
      const adapter = this.platformManager.getAdapter(message.platformType);
      if (adapter) {
        await adapter.sendMessage(message.channelId, {
          text: `タスク${taskId}へのフィードバック処理に失敗しました：${(error as Error).message}`
        });
      }
    }
  }

  /**
   * 画像生成リクエストの処理
   */
  private async handleImageRequest(message: PlatformMessage, imagePrompt: string): Promise<void> {
    try {
      // 処理中メッセージ
      const adapter = this.platformManager.getAdapter(message.platformType);
      if (!adapter) return;
      
      const processingMsgId = await adapter.sendMessage(message.channelId, {
        text: `「${imagePrompt}」の画像を生成中です...`
      });
      
      // 画像生成リクエストをAgentCoreに委譲
      const imageBuffer = await this.agentCore.generateImage(imagePrompt, {
        userId: message.author.id,
        platformType: message.author.platformType,
        channelId: message.channelId
      });
      
      if (!imageBuffer) {
        if (processingMsgId) {
          await adapter.updateMessage(message.channelId, processingMsgId, {
            text: `画像生成に失敗しました。別のプロンプトで試してみてください。`
          });
        } else {
          await adapter.sendMessage(message.channelId, {
            text: `画像生成に失敗しました。別のプロンプトで試してみてください。`
          });
        }
        return;
      }
      
      // 生成した画像を送信
      if (processingMsgId) {
        await adapter.updateMessage(message.channelId, processingMsgId, {
          text: `「${imagePrompt}」の画像を生成しました：`,
          images: [imageBuffer]
        });
      } else {
        await adapter.sendMessage(message.channelId, {
          text: `「${imagePrompt}」の画像を生成しました：`,
          images: [imageBuffer]
        });
      }
    } catch (error) {
      logger.error('Failed to generate image:', error);
      
      const adapter = this.platformManager.getAdapter(message.platformType);
      if (adapter) {
        await adapter.sendMessage(message.channelId, {
          text: `画像生成中にエラーが発生しました：${(error as Error).message}`
        });
      }
    }
  }
}