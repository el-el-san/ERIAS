import { Message } from 'discord.js';
import { config } from '../../config/config.js';
import logger from '../../utils/logger.js';
import { GeminiClient } from '../../llm/geminiClient.js';
import { conversationManager } from '../../llm/conversationManager.js';
import { FeedbackMessageHandler } from '../feedbackMessageHandler.js';
import { CommandHandler } from '../commandHandler.js';
import { PlatformMessage, PlatformUser, PlatformType } from '../../platforms/types.js';

export function discordMessageToPlatformMessage(message: Message): PlatformMessage {
  const user: PlatformUser = {
    id: message.author.id,
    name: message.author.username,
    platformId: message.author.id,
    platformType: PlatformType.DISCORD,
  };
  return {
    id: message.id,
    content: message.content,
    author: user,
    channelId: message.channel.id,
    timestamp: message.createdAt,
    attachments: message.attachments ? Array.from(message.attachments.values()) : [],
    platformType: PlatformType.DISCORD,
    rawMessage: message,
  };
}
/**
 * Discordメッセージ/コマンド/会話ハンドラ
 */

/**
 * Discordメッセージ/コマンド/会話ハンドラ
 * Discord.jsのMessageを受け取り、PlatformMessageに変換して処理を委譲
 */
export async function handleMessage(
  message: Message,
  commandPrefix: string,
  feedbackHandler: FeedbackMessageHandler,
  handleCommand: (message: PlatformMessage, command?: string, args?: string[]) => Promise<void>,
  handleConversation: (message: PlatformMessage) => Promise<void>
): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (config.ALLOWED_GUILD_IDS.length > 0 && !config.ALLOWED_GUILD_IDS.includes(message.guild.id)) {
    logger.warn(`Message from non-allowed guild: ${message.guild.id}`);
    return;
  }
  if (config.ALLOWED_USER_IDS.length > 0 && !config.ALLOWED_USER_IDS.includes(message.author.id)) {
    logger.warn(`Message from non-allowed user: ${message.author.id}`);
    return;
  }

  const platformMessage = discordMessageToPlatformMessage(message);

  // 画像生成リクエストを最初にチェック
  await feedbackHandler.handleMessage(platformMessage);

  // その他のフィードバックメッセージをチェック
  if (platformMessage.content.includes('task:')) {
    await feedbackHandler.handleMessage(platformMessage);
  }
  if (platformMessage.content.startsWith(commandPrefix)) {
    const args = platformMessage.content.slice(commandPrefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    await handleCommand(platformMessage, command, args);
  } else {
    await handleConversation(platformMessage);
  }
}

export async function handleCommand(
  message: PlatformMessage,
  command?: string,
  args: string[] = [],
  commandPrefix: string = '/',
  handleHelpCommand?: (message: PlatformMessage) => Promise<void>,
  handleNewProjectCommand?: (message: PlatformMessage, spec: string) => Promise<void>,
  handleStatusCommand?: (message: PlatformMessage, taskId?: string) => Promise<void>,
  handleCancelCommand?: (message: PlatformMessage, taskId?: string) => Promise<void>,
  handleClearCommand?: (message: PlatformMessage) => Promise<void>
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
          // PlatformMessageのrawMessageがdiscord.jsのMessageである場合のみreplyを使う
          if (message.rawMessage && typeof message.rawMessage.reply === 'function') {
            await message.rawMessage.reply(`不明なコマンドです: \`${command}\`\nヘルプを表示するには \`${commandPrefix}help\` と入力してください。`);
          }
        }
    }
  } catch (error) {
    logger.error(`Error handling command ${command}: ${(error as Error).message}`);
    if (message.rawMessage && typeof message.rawMessage.reply === 'function') {
      await message.rawMessage.reply(`コマンド実行中にエラーが発生しました: ${(error as Error).message}`);
    }
  }
}

export async function handleConversation(message: PlatformMessage): Promise<void> {
  try {
    // DiscordのrawMessageが存在する場合のみreply等を利用
    const discordMsg = message.rawMessage;
    logger.info(`[会話] ユーザー: ${message.author.name} 入力: ${message.content}`);
    let responseMsg = discordMsg && typeof discordMsg.reply === 'function'
      ? await discordMsg.reply('考え中...')
      : null;
    const geminiClient = new GeminiClient();
    const systemPrompt = "あなたはフレンドリーなアシスタントです。ユーザーからの質問に簡潔かつ役立つ形で答えてください。コードが必要な場合は実用的なコード例を提供してください。前回までの会話を考慮して対応してください。";
    const history = conversationManager.getConversationHistory(
      message.author.id,
      message.channelId
    );
    conversationManager.addMessage(
      message.author.id,
      message.channelId,
      message.author.platformId || 'dm',
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
        if (responseMsg && responseBuffer.length <= maxMessageLength) {
          await responseMsg.edit(responseBuffer);
        } else if (responseMsg) {
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
            await discordMsg.reply(chunks[i]);
          }
          if (chunks.length > 1) {
            const lastMsg = await discordMsg.reply(chunks[chunks.length - 1]);
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
      message.channelId,
      message.author.platformId || 'dm',
      response,
      true
    );
    logger.info(`[会話] Gemini応答完了: ${response?.substring(0, 100)}...`);
  } catch (error) {
    logger.error(`[会話] Error in conversation with LLM: ${(error as Error).message} 入力: ${message.content}`);
    if (message.rawMessage && typeof message.rawMessage.reply === 'function') {
      await message.rawMessage.reply(`すみません、会話処理中にエラーが発生しました: ${(error as Error).message}`);
    }
  }
}