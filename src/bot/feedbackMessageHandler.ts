import { Message } from 'discord.js';
import { FeedbackPriority, FeedbackType, FeedbackUrgency } from '../agent/types.js';
import { AgentCore } from '../agent/agentCore.js';
import logger from '../utils/logger.js';
import { ImageGenerator } from '../generators/imageGenerator.js';
import config from '../config/config.js';

/**
 * ユーザーからのフィードバックメッセージを処理するクラス
 */
export class FeedbackMessageHandler {
  private agentCore: AgentCore;
  private imageGenerator: ImageGenerator;
  private imageGeneratorReady: Promise<void>;
  
  constructor(agentCore: AgentCore) {
    this.agentCore = agentCore;
    this.imageGenerator = new ImageGenerator({
      apiKey: config.llm.google.apiKey,
      model: 'gemini-2.0-flash-exp'
    });
    
    // 画像生成器の初期化を待つ
    this.imageGeneratorReady = new Promise((resolve) => {
      // インスタンス生成後、少し待ってから ready とみなす
      setTimeout(() => resolve(), 1000);
    });
  }
  
  /**
   * メッセージからフィードバックを抽出して処理
   * @param message Discordメッセージ
   */
  public async handleMessage(message: Message): Promise<boolean> {
    // Botのメッセージは無視
    if (message.author.bot) return false;
    
    // 画像生成リクエストをチェック
    if (this.imageGenerator.detectImageRequest(message.content)) {
      await this.imageGeneratorReady; // 初期化を待つ
      return await this.handleImageGeneration(message);
    }
    
    // タスクIDを抽出するための正規表現
    const taskIdRegex = /task:([a-f0-9-]+)/i;
    const match = message.content.match(taskIdRegex);
    
    if (!match) return false;
    
    const taskId = match[1];
    const content = message.content.replace(taskIdRegex, '').trim();
    
    // ファイル指定の構文 file:path/to/file.js を検出
    const fileMatch = content.match(/file:(\S+)/);
    let targetFile: string | undefined = undefined;
    let cleanContent = content;
    
    if (fileMatch) {
      targetFile = fileMatch[1];
      cleanContent = content.replace(/file:\S+/, '').trim();
    }
    
    // フィードバックタイプを検出 (例: #feature, #tech, #code, #fix)
    const typeMatch = cleanContent.match(/#(\w+)/);
    let feedbackType: FeedbackType = 'general';
    let urgency: FeedbackUrgency = 'normal';
    let priority: FeedbackPriority = 'normal';
    
    if (typeMatch) {
      const typeStr = typeMatch[1].toLowerCase();
      cleanContent = cleanContent.replace(/#\w+/, '').trim();
      
      // タグに基づいて処理設定
      switch (typeStr) {
        case 'feature':
        case '機能':
          feedbackType = 'feature';
          break;
        case 'code':
        case 'coding':
        case 'コード':
          feedbackType = 'code';
          break;
        case 'plan':
        case 'design':
        case '計画':
        case '設計':
          feedbackType = 'plan';
          break;
        case 'fix':
        case 'bug':
        case '修正':
          feedbackType = 'fix';
          break;
        case 'urgent':
        case '緊急':
          urgency = 'critical';
          break;
        case 'high':
        case '優先':
          priority = 'high';
          break;
      }
    }
    
    // 緊急・優先キーワードの抽出（#タグに加えて文中でも検出）
    if (cleanContent.match(/\b(urgent|緊急|immediately|すぐに)\b/i)) {
      urgency = 'critical';
    }
    
    if (cleanContent.match(/\b(priority|high|優先|重要)\b/i)) {
      priority = 'high';
    }
    
    // タスクの現在のフェーズを取得
    const task = this.agentCore.getTask(taskId);
    
    // フィードバックの処理方法を決定
    let responseMessage = '';
    
    if (task) {
      // フィードバックをキューに追加
      const result = await this.agentCore.queueUserFeedback(
        taskId,
        message.author.id,
        cleanContent,
        priority,
        urgency,
        feedbackType,
        targetFile
      );
      
      if (result) {
        if (urgency === 'critical') {
          switch (task.status) {
            case 'testing':
              responseMessage = `✅ タスク \`${taskId}\` に対する緊急指示を受け付けました。テスト完了後すぐに対応します。`;
              break;
            case 'completed':
            case 'failed':
              responseMessage = `⚠️ タスク \`${taskId}\` は既に完了しています。新しいタスクを開始するには /new コマンドを使用してください。`;
              break;
            default:
              responseMessage = `✅ タスク \`${taskId}\` に対する緊急指示を受け付けました。現在の${task.status}フェーズ完了後に反映します。`;
          }
        } else {
          responseMessage = `✅ タスク \`${taskId}\` に対する指示を受け付けました。`;
          
          // フィードバックの種類に応じたメッセージ
          if (feedbackType === 'feature') {
            responseMessage += `新機能として次のフェーズで対応します。`;
          } else if (feedbackType === 'fix') {
            responseMessage += `修正として処理します。`;
          } else if (targetFile) {
            responseMessage += `ファイル \`${targetFile}\` に対する変更として処理します。`;
          }
        }
      } else {
        responseMessage = `❌ タスク \`${taskId}\` が見つからないか、あなたが所有者ではありません。`;
      }
    } else {
      responseMessage = `❌ タスク \`${taskId}\` が見つかりません。`;
    }
    
    try {
      await message.reply(responseMessage);
      return true;
    } catch (error) {
      logger.error(`Failed to reply to feedback message: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 画像生成リクエストを処理
   * @param message Discordメッセージ
   */
  private async handleImageGeneration(message: Message): Promise<boolean> {
    try {
      // ユーザーが直接入力を希望しているかチェック
      const isDirect = message.content.toLowerCase().includes('直接入力') || 
                      message.content.toLowerCase().includes('そのまま');
      
      // 画像生成の開始を通知
      const initialMsg = isDirect ? 
        '🎨 画像を生成中です...（プロンプトをそのまま使用）' : 
        '🎨 画像を生成中です...（AIがプロンプトを最適化中）';
      
      await message.reply(initialMsg);

      // 画像を生成
      const attachment = await this.imageGenerator.generateImage(message.content);

      // 生成された画像を送信
      const finalMsg = isDirect ? 
        '✨ 画像を生成しました！（入力プロンプトをそのまま使用）' : 
        '✨ 画像を生成しました！（AIがプロンプトを最適化）';
      
      await message.reply({
        content: finalMsg,
        files: [attachment]
      });

      return true;
    } catch (error) {
      logger.error('Failed to generate image', { error });
      
      try {
        await message.reply('❌ 画像の生成に失敗しました。もう一度お試しください。');
      } catch (replyError) {
        logger.error('Failed to send error message', { replyError });
      }
      
      return false;
    }
  }
}
