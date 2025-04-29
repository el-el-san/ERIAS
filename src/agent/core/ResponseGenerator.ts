/**
 * 応答生成機能
 */
import { NotificationTarget } from '../../platforms/types';
import { GeminiClient } from '../../llm/geminiClient';
import { conversationManager } from '../../llm/conversationManager';
import { PromptBuilder, PromptType } from '../../llm/promptBuilder';
import { logger } from '../../tools/logger';

export class ResponseGenerator {
  private geminiClient: GeminiClient;
  private promptBuilder: PromptBuilder;

  constructor(geminiClient: GeminiClient, promptBuilder: PromptBuilder) {
    this.geminiClient = geminiClient;
    this.promptBuilder = promptBuilder;
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
      if (message.toLowerCase().includes('help') || message.toLowerCase().includes('ヘルプ')) {
        logger.debug(`ヘルプキーワードを検出しました`);
        return this.generateHelpResponse(target);
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
        this.addResponseToHistory(target, response);
        
        return response;
      } catch (llmError) {
        logger.error(`Gemini API error: ${(llmError as Error).message}`);
        if (llmError instanceof Error && llmError.stack) {
          logger.error(`エラースタック: ${llmError.stack}`);
        }
        
        return this.generateFallbackResponse(target);
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
   * ヘルプメッセージを生成
   */
  private generateHelpResponse(target: NotificationTarget): string {
    const helpResponse = `ERIASへようこそ！以下のコマンドが利用可能です：

/help - このヘルプメッセージを表示
/newproject [仕様] - 新しいプロジェクトを開始
/status [taskID] - タスクの状態を確認
/cancel [taskID] - タスクをキャンセル
/githubrepo [URL] [タスク] - GitHubリポジトリに機能を追加`;
    
    this.addResponseToHistory(target, helpResponse);
    
    return helpResponse;
  }

  /**
   * フォールバックメッセージを生成
   */
  private generateFallbackResponse(target: NotificationTarget): string {
    const fallbackResponse = `すみません、応答の生成中に問題が発生しました。直接コマンドを使用してみてください：
/help - 利用可能なコマンドを表示`;
    
    this.addResponseToHistory(target, fallbackResponse);
    
    return fallbackResponse;
  }

  /**
   * 応答を会話履歴に追加
   */
  private addResponseToHistory(target: NotificationTarget, response: string): void {
    conversationManager.addMessage(
      target.userId,
      target.channelId,
      '',
      response,
      true // アシスタントからのメッセージ
    );
  }
}
