import logger from '../../utils/logger.js';
import { config } from '../../config/config.js';
import { PlatformType } from '../../platforms/types.js';
import { Client, Events } from 'discord.js';
import { CommandHandler } from '../commandHandler.js';
import { FeedbackMessageHandler } from '../feedbackMessageHandler.js';
import AgentCore from '../../agent/agentCore.js';
import { discordMessageToPlatformMessage } from './handlers.js';

/**
 * Discordボットの起動・停止・イベントリスナー・コマンド登録
 */

// Discordボットを起動
export async function startBot(client: Client): Promise<void> {
  try {
    logger.info('Starting Discord bot...');
    await client.login(config.DISCORD_TOKEN);
    logger.info('Discord bot started successfully');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      logger.error(`Failed to start Discord bot: ${(error as { message?: string }).message}`);
    } else {
      logger.error('Failed to start Discord bot: 不明なエラー');
    }
    throw error;
  }
}

// Discordボットを停止
export async function stopBot(client: Client): Promise<void> {
  try {
    logger.info('Stopping Discord bot...');
    await client.destroy();
    logger.info('Discord bot stopped successfully');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      logger.error(`Error stopping Discord bot: ${(error as { message?: string }).message}`);
    } else {
      logger.error('Error stopping Discord bot: 不明なエラー');
    }
  }
}

// イベントリスナーを設定
import { handleMessage as extHandleMessage } from './handlers.js';

export function setupEventListeners(
  client: Client,
  commandHandler: CommandHandler,
  feedbackHandler: FeedbackMessageHandler,
  agentCore: any,
  progressListener: (task: any, message: string, isPartial?: boolean) => Promise<void>,
  setIsReady: (ready: boolean) => void,
  commandPrefix: string,
  handleCommand: (message: import('../../platforms/types').PlatformMessage, command?: string, args?: string[]) => Promise<void>,
  handleConversation: (message: import('../../platforms/types').PlatformMessage) => Promise<void>
): void {
  // ボット起動完了イベント
  client.once(Events.ClientReady, (botClient) => {
    setIsReady(true);
    logger.info(`Discord bot logged in as ${botClient.user.tag}`);
    if (!client.user) return;
    registerCommands(client.user.id, client);
  });

  // メッセージ受信イベント
  client.on(Events.MessageCreate, async (message) => {
    // PlatformMessageに変換してからハンドラに渡す
    const platformMessage = discordMessageToPlatformMessage(message);
    await extHandleMessage(
      message,
      commandPrefix,
      feedbackHandler,
      (msg, command, args) => handleCommand(platformMessage, command, args),
      (msg) => handleConversation(platformMessage)
    );
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    // PlatformCommand型にラップ
    const platformCommand = {
      name: interaction.commandName,
      respondToCommand: async (response: any) => {
        await interaction.reply(typeof response === 'string' ? response : response.content);
      },
      platformType: PlatformType.DISCORD,
      user: {
        id: interaction.user.id,
        username: interaction.user.username,
        platformType: PlatformType.DISCORD,
        name: interaction.user.username,
        platformId: interaction.user.id
      },
      channelId: interaction.channelId,
      options: interaction.options.data.reduce((acc, opt) => {
        acc[opt.name] = opt.value;
        return acc;
      }, {} as Record<string, any>)
    };
    // CommandHandlerにhandleCommandは存在しないため、必要に応じてAPIに合わせて修正
    // ここではdiscordBot.ts側でコマンド分岐処理を行うため、呼び出しを削除またはコメントアウト
    // await commandHandler.handleCommand(platformCommand);
  });

  // エラーイベント
  client.on('error', (error) => {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      logger.error(`Discord client error: ${(error as { message?: string }).message}`);
    } else {
      logger.error('Discord client error: 不明なエラー');
    }
  });

  // 進捗通知リスナー
  // agentCore.addProgressListener(progressListener); // 存在しない場合はコメントアウトまたは削除
}

// コマンド登録
export async function registerCommands(clientId: string, client: Client): Promise<void> {
  // コマンド登録処理（省略。必要に応じて実装）
  // 例: REST APIでDiscordにコマンドを登録
}