import logger from '../../utils/logger.js';
import config from '../../config/config.js';
import { Client, Events } from 'discord.js';
import { CommandHandler } from '../commandHandler.js';
import { FeedbackMessageHandler } from '../feedbackMessageHandler.js';
import { AgentCore } from '../../agent/agentCore.js';

/**
 * Discordボットの起動・停止・イベントリスナー・コマンド登録
 */

// Discordボットを起動
export async function startBot(client: Client): Promise<void> {
  try {
    logger.info('Starting Discord bot...');
    await client.login(config.discord.token);
    logger.info('Discord bot started successfully');
  } catch (error) {
    logger.error(`Failed to start Discord bot: ${(error as Error).message}`);
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
    logger.error(`Error stopping Discord bot: ${(error as Error).message}`);
  }
}

// イベントリスナーを設定
import { handleMessage as extHandleMessage } from './handlers.js';

export function setupEventListeners(
  client: Client,
  commandHandler: CommandHandler,
  feedbackHandler: FeedbackMessageHandler,
  agentCore: AgentCore,
  progressListener: (task: any, message: string, isPartial?: boolean) => Promise<void>,
  setIsReady: (ready: boolean) => void,
  commandPrefix: string,
  handleCommand: (message: any, command?: string, args?: string[]) => Promise<void>,
  handleConversation: (message: any) => Promise<void>
): void {
  // ボット起動完了イベント
  client.once(Events.ClientReady, (botClient) => {
    setIsReady(true);
    logger.info(`Discord bot logged in as ${botClient.user.tag}`);
    registerCommands(client.user.id, client);
  });

  // メッセージ受信イベント
  client.on(Events.MessageCreate, async (message) => {
    await extHandleMessage(
      message,
      commandPrefix,
      feedbackHandler,
      handleCommand,
      handleConversation
    );
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await commandHandler.handleSlashCommand(interaction);
  });

  // エラーイベント
  client.on('error', (error) => {
    logger.error(`Discord client error: ${error.message}`);
  });

  // 進捗通知リスナー
  agentCore.addProgressListener(progressListener);
}

// コマンド登録
export async function registerCommands(clientId: string, client: Client): Promise<void> {
  // コマンド登録処理（省略。必要に応じて実装）
  // 例: REST APIでDiscordにコマンドを登録
}