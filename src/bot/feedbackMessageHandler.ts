import { Message } from 'discord.js';
import { FeedbackPriority, FeedbackType, FeedbackUrgency } from '../agent/types.js';
import { AgentCore } from '../agent/agentCore.js';
import logger from '../utils/logger.js';

/**
 * ユーザーからのフィードバックメッセージを処理するクラス
 */
export class FeedbackMessageHandler {
  private agentCore: AgentCore;
  
  constructor(agentCore: AgentCore) {
    this.agentCore = agentCore;
  }
  
  /**
   * メッセージからフィードバックを抽出して処理
   * @param message Discordメッセージ
   */
  public async handleMessage(message: Message): Promise<boolean> {
    // Botのメッセージは無視
    if (message.author.bot) return false;
    
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
}
