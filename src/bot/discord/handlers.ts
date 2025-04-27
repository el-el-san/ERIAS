import { Message } from 'discord.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';
import { GeminiClient } from '../../llm/geminiClient.js';
import { conversationManager } from '../../llm/conversationManager.js';
import { FeedbackMessageHandler } from '../feedbackMessageHandler.js';
import { CommandHandler } from '../commandHandler.js';

/**
 * Discordメッセージ/コマンド/会話ハンドラ
 */

export async function handleMessage(
  message: Message,
  commandPrefix: string,
  feedbackHandler: FeedbackMessageHandler,
  handleCommand: (message: Message, command?: string, args?: string[]) => Promise<void>,
  handleConversation: (message: Message) => Promise<void>
): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (config.discord.allowedGuildIds.length > 0 && !config.discord.allowedGuildIds.includes(message.guild.id)) {
    logger.warn(`Message from non-allowed guild: ${message.guild.id}`);
    return;
  }
  if (config.discord.allowedUserIds.length > 0 && !config.discord.allowedUserIds.includes(message.author.id)) {
    logger.warn(`Message from non-allowed user: ${message.author.id}`);
    return;
  }
  
  // 画像生成リクエストを最初にチェック
  const handled = await feedbackHandler.handleMessage(message);
  if (handled) return;

  // その他のフィードバックメッセージをチェック  
  if (message.content.includes('task:')) {
    const handled = await feedbackHandler.handleMessage(message);
    if (handled) return;
  }
  if (message.content.startsWith(commandPrefix)) {
    const args = message.content.slice(commandPrefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    await handleCommand(message, command, args);
  } else {
    await handleConversation(message);
  }
}

export async function handleCommand(
  message: Message,
  command?: string,
  args: string[] = [],
  commandPrefix: string = '/',
  handleHelpCommand?: (message: Message) => Promise<void>,
  handleNewProjectCommand?: (message: Message, spec: string) => Promise<void>,
  handleStatusCommand?: (message: Message, taskId?: string) => Promise<void>,
  handleCancelCommand?: (message: Message, taskId?: string) => Promise<void>,
  handleClearCommand?: (message: Message) => Promise<void>
): Promise<void> {
  try {
    switch (command) {
      case 'help':
        if (handleHelpCommand) await handleHelpCommand(message);
        break;
      case 'new':
      case 'newproject':
        if (handleNewProjectCommand) {
          // 通常のプロジェクト生成のみを処理
          const spec = args.join(' ');
          await handleNewProjectCommand(message, spec);
        }
        break;
      case 'status':
        if (handleStatusCommand) await handleStatusCommand(message, args[0]);
        break;
      case 'cancel':
        if (handleCancelCommand) await handleCancelCommand(message, args[0]);
        break;
      case 'clear':
        if (handleClearCommand) await handleClearCommand(message);
        break;
      default:
        if (command) {
          await message.reply(`不明なコマンドです: \`${command}\`\nヘルプを表示するには \`${commandPrefix}help\` と入力してください。`);
        }
    }
  } catch (error) {
    logger.error(`Error handling command ${command}: ${(error as Error).message}`);
    await message.reply(`コマンド実行中にエラーが発生しました: ${(error as Error).message}`);
  }
}

export async function handleConversation(message: Message): Promise<void> {
  try {
    logger.info(`[会話] ユーザー: ${message.author.tag} 入力: ${message.content}`);
    let responseMsg = await message.reply('考え中...');
    const geminiClient = new GeminiClient();
    const systemPrompt = "あなたはフレンドリーなアシスタントです。ユーザーからの質問に簡潔かつ役立つ形で答えてください。コードが必要な場合は実用的なコード例を提供してください。前回までの会話を考慮して対応してください。";
    const history = conversationManager.getConversationHistory(
      message.author.id,
      message.channel.id
    );
    conversationManager.addMessage(
      message.author.id,
      message.channel.id,
      message.guild ? message.guild.id : 'dm',
      message.content,
      false
    );

    let responseBuffer = '';
    let lastUpdateTime = Date.now();
    const updateInterval = 1000; // 1秒ごとに更新

    const streamCallback = async (chunk: string, isComplete: boolean) => {
      responseBuffer += chunk;
      const currentTime = Date.now();
      if (isComplete || currentTime - lastUpdateTime >= updateInterval) {
        lastUpdateTime = currentTime;
        const maxMessageLength = 2000;
        if (responseBuffer.length <= maxMessageLength) {
          await responseMsg.edit(responseBuffer);
        } else {
          const chunks = [];
          let remainingText = responseBuffer;
          while (remainingText.length > maxMessageLength) {
            const chunkSize = maxMessageLength;
            let chunk = remainingText.substring(0, chunkSize);
            if (!chunk.endsWith('\n')) {
              const lastNewline = chunk.lastIndexOf('\n');
              if (lastNewline > chunkSize * 0.8) {
                chunk = chunk.substring(0, lastNewline + 1);
              }
            }
            chunks.push(chunk);
            remainingText = remainingText.substring(chunk.length);
          }
          chunks.push(remainingText);
          await responseMsg.edit(chunks[0]);
          for (let i = 1; i < chunks.length - 1; i++) {
            await message.reply(chunks[i]);
          }
          if (chunks.length > 1) {
            const lastMsg = await message.reply(chunks[chunks.length - 1]);
            responseMsg = lastMsg;
            responseBuffer = chunks[chunks.length - 1];
          }
        }
      }
    };

    logger.info(`[会話] Gemini API呼び出し開始: ${message.content}`);
    const response = await geminiClient.generateContentStream(
      message.content,
      streamCallback,
      systemPrompt,
      0.7,
      60000,
      history
    );

    conversationManager.addMessage(
      message.author.id,
      message.channel.id,
      message.guild ? message.guild.id : 'dm',
      response,
      true
    );
    logger.info(`[会話] Gemini応答完了: ${response?.substring(0, 100)}...`);
  } catch (error) {
    logger.error(`[会話] Error in conversation with LLM: ${(error as Error).message} 入力: ${message.content}`);
    await message.reply(`すみません、会話処理中にエラーが発生しました: ${(error as Error).message}`);
  }
}