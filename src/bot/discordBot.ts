import { Client, GatewayIntentBits, Message, Events, REST, Routes, AttachmentBuilder, TextChannel } from 'discord.js';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';
import { conversationManager } from '../llm/conversationManager.js';
import { GeminiClient } from '../llm/geminiClient.js';
import { ProjectTask } from '../agent/types.js';
import AgentCore from '../agent/agentCore.js';
import { FeedbackMessageHandler } from './feedbackMessageHandler.js';
import { CommandHandler } from './commandHandler.js';
import {
  handleMessage as extHandleMessage,
  handleCommand as extHandleCommand,
  handleConversation as extHandleConversation,
  discordMessageToPlatformMessage
} from './discord/handlers';
import { ChatInputCommandInteraction, CacheType } from 'discord.js';
import { PlatformCommand, PlatformType, PlatformMessage } from '../platforms/types.js';

// Discord Interaction → PlatformCommand変換ラッパー
function discordInteractionToPlatformCommand(interaction: ChatInputCommandInteraction<CacheType>): PlatformCommand {
  return {
    name: interaction.commandName,
    options: Object.fromEntries(interaction.options.data.map(opt => [opt.name, opt.value])),
    user: {
      id: interaction.user.id,
      name: interaction.user.username,
      platformId: interaction.user.id,
      platformType: PlatformType.DISCORD
    },
    channelId: interaction.channelId,
    respondToCommand: async (content) => {
      await interaction.reply(content.text || ''); // 必要に応じて添付ファイル等も対応
    },
    platformType: PlatformType.DISCORD,
    rawCommand: interaction
  };
}

// Discord Message → PlatformMessage型アサーションラッパー
function asPlatformMessage(msg: unknown): PlatformMessage {
  // 既にPlatformMessageならそのまま返す
  if (msg && typeof msg === 'object' && 'platformType' in msg) return msg as PlatformMessage;
  // discordMessageToPlatformMessageが正しい型を返す前提
  return discordMessageToPlatformMessage(msg as Message);
}
import { startBot, stopBot, setupEventListeners } from './discord/events.js';

/**
 * Discordボットインターフェイス
 * ユーザーとの対話、コマンド処理、進捗通知を担当
 */
export class DiscordBot {
  private client: Client;
  private agentCore: any;
  private feedbackHandler: FeedbackMessageHandler;
  private commandHandler: CommandHandler; // 追加: CommandHandlerのインスタンス
  private commandPrefix: string = '/';
  private isReady: boolean = false;
  
  // 進行中プロジェクトの状態メッセージ
  private progressMessages: Map<string, Message> = new Map();
  
  /**
   * DiscordBotを初期化
   * @param agentCore AIエージェントコア
   */
  constructor(agentCore: any) {
    this.agentCore = agentCore;
    this.feedbackHandler = new FeedbackMessageHandler(agentCore);
    this.commandHandler = new CommandHandler();
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });
    // isReadyのsetterを渡す
    setupEventListeners(
      this.client,
      this.commandHandler,
      this.feedbackHandler,
      this.agentCore,
      this.progressListener.bind(this),
      (ready: boolean) => { this.isReady = ready; },
      this.commandPrefix,
      this.handleCommand.bind(this),
      this.handleConversation.bind(this)
    );
  }
  
  /**
   * Discordボットを起動
   */
  public async start(): Promise<void> {
    await startBot(this.client);
  }

  public async stop(): Promise<void> {
    await stopBot(this.client);
  }
  
  /**
   * イベントリスナーを設定
   */
  private setupEventListeners(): void {
    // ボット起動完了イベント
    this.client.once(Events.ClientReady, (client) => {
      this.isReady = true;
      logger.info(`Discord bot logged in as ${client.user.tag}`);
      
      this.registerCommands(client.user.id);
    });
    
    // メッセージ受信イベント
    this.client.on(Events.MessageCreate, this.handleMessage.bind(this));
    
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      const platformCommand = discordInteractionToPlatformCommand(interaction);
      // CommandHandlerにhandleCommandは存在しないため、コマンド名に応じて分岐
      // 例: /newproject, /status, /cancel, /help
      const command = platformCommand.name;
      if (command === 'newproject') {
        await this.commandHandler.handleNewProject(
          platformCommand.options?.spec || '',
          {
            platformId: platformCommand.user.id,
            channelId: platformCommand.channelId,
            userId: platformCommand.user.id,
            messageId: platformCommand.rawCommand.id
          }
        );
      } else if (command === 'status') {
        await this.commandHandler.handleStatus(
          platformCommand.options?.taskId || ''
        );
      } else if (command === 'cancel') {
        await this.commandHandler.handleCancel(
          platformCommand.options?.taskId || '',
          {
            platformId: platformCommand.user.id,
            channelId: platformCommand.channelId,
            userId: platformCommand.user.id,
            messageId: platformCommand.rawCommand.id
          }
        );
      } else if (command === 'help') {
        await this.commandHandler.handleHelp();
      }
      // 必要に応じて他のコマンドも追加
    });
    
    // エラーイベント
    this.client.on('error', (error) => {
      logger.error(`Discord client error: ${error.message}`);
    });
  }
  
  /**
   * メッセージ処理
   * @param message 受信メッセージ
   */
  private async handleMessage(message: Message): Promise<void> {
    const platformMessage = discordMessageToPlatformMessage(message);
    await extHandleMessage(
      message,
      this.commandPrefix,
      this.feedbackHandler,
      (msg, command, args) => this.handleCommand(asPlatformMessage(msg), command, args),
      (msg) => this.handleConversation(asPlatformMessage(msg))
    );
  }

  private async handleCommand(message: PlatformMessage, command?: string, args: string[] = []): Promise<void> {
    // messageはPlatformMessage型で受け取る
    await extHandleCommand(
      message,
      command,
      args,
      this.commandPrefix,
      (msg) => this.handleHelpCommand(this.asDiscordMessage(msg)),
      (msg, spec) => this.handleNewProjectCommand(this.asDiscordMessage(msg), spec),
      (msg, taskId) => this.handleStatusCommand(this.asDiscordMessage(msg), taskId),
      (msg, taskId) => this.handleCancelCommand(this.asDiscordMessage(msg), taskId),
      (msg) => this.handleClearCommand(this.asDiscordMessage(msg))
    );
  }

  private async handleConversation(message: PlatformMessage): Promise<void> {
    await extHandleConversation(message);
  }
  
  /**
   * コマンド処理
   * @param message メッセージオブジェクト
   * @param command コマンド名
   * @param args コマンド引数
   */
  // --- 重複実装削除 ---
  
  /**
   * 会話履歴クリアコマンド処理
   * @param message メッセージオブジェクト
   */
  // PlatformMessage→Discord Message変換（型アサーション）
  private asDiscordMessage(msg: unknown): Message {
    // Discord.js Message型のプロパティが存在するかで判定
    if (msg && typeof msg === 'object' && 'reply' in msg && 'author' in msg && 'channel' in msg) {
      return msg as Message;
    }
    // PlatformMessageからrawMessageを取得
    if (msg && typeof msg === 'object' && 'rawMessage' in msg) {
      return (msg as { rawMessage: Message }).rawMessage as Message;
    }
    throw new Error('Invalid message type for Discord command handler');
  }

  private async handleClearCommand(message: Message): Promise<void> {
    try {
      const result = conversationManager.clearConversationHistory(
        message.author.id,
        message.channel.id
      );
      
      if (result) {
        await message.reply('会話履歴をクリアしました。新しい会話を始めましょう。');
        logger.info(`Cleared conversation history for user ${message.author.tag} in channel ${message.channel.id}`);
      } else {
        await message.reply('会話履歴はありませんでした。');
      }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`Error clearing conversation history: ${(error as { message?: string }).message}`);
        await message.reply(`会話履歴のクリア中にエラーが発生しました: ${(error as { message?: string }).message}`);
      } else {
        logger.error('Error clearing conversation history: 不明なエラー');
        await message.reply('会話履歴のクリア中に不明なエラーが発生しました。');
      }
    }
  }
  
  /**
   * helpコマンド処理
   * @param message メッセージオブジェクト
   */
  private async handleHelpCommand(message: Message): Promise<void> {
    const helpText = `
**Discord AI エージェント - コマンド一覧**

\`${this.commandPrefix}new [仕様]\` - 新しいプロジェクトを生成
\`${this.commandPrefix}status [タスクID]\` - プロジェクト生成の状態を確認
\`${this.commandPrefix}cancel [タスクID]\` - 実行中のプロジェクト生成をキャンセル
\`${this.commandPrefix}clear\` - 現在の会話履歴をクリア
\`${this.commandPrefix}help\` - このヘルプを表示

**フィードバック機能**
\`task:タスクID [内容]\` - 実行中プロジェクトに追加の指示を提供

以下のタグも使用できます：
#urgent または #緊急 - 緊急の指示として処理
#feature または #機能 - 新機能の追加として処理
#fix または #修正 - バグ修正指示として処理
#code または #コード - コード修正指示として処理
file:パス - 特定ファイルに対する指示（例: \`file:src/App.js\`）

**通常会話**
スラッシュ(/)から始まらないメッセージには、AIがチャット形式で応答します。質問やコードの相談などにご利用ください。
会話履歴は保存され、AIは前回までの話を考慮して応答します。\`${this.commandPrefix}clear\`で履歴をクリアできます。

**使用例**
\`${this.commandPrefix}new Reactを使用したシンプルなTODOアプリを作成してください。LocalStorageでデータを保存し、タスクの追加、編集、削除、完了のマーキングができるようにしてください。\`

\`task:abc123 #urgent 検索機能も追加してください\` - 実行中タスクに緊急の指示を追加
`;
    
    await message.reply(helpText);
  }
  
  /**
   * newprojectコマンド処理
   * @param message メッセージオブジェクト
   * @param spec プロジェクト仕様
   * @param repoUrl GitHubリポジトリURL
   */
  private async handleNewProjectCommand(message: Message, spec: string): Promise<void> {
    if (!spec || spec.trim().length === 0) {
      await message.reply(`プロジェクトの仕様を指定してください。例: \`${this.commandPrefix}new Reactを使ったTODOアプリ\``);
      return;
    }

    // 応答メッセージを送信
    const responseMsg = await message.reply('プロジェクト生成リクエストを受け付けました。処理を開始します...');

    try {
      // AgentCoreのstartNewProjectを呼び出し
      logger.info(`Starting project generation for spec: ${spec}`);
      const taskId = await this.agentCore.startNewProject(spec, {
        userId: message.author.id,
        channelId: message.channel.id,
        platformType: PlatformType.DISCORD,
        // 必要に応じて追加
      });

      // 進捗メッセージを保存
      this.progressMessages.set(taskId, responseMsg);

      // タスクIDを通知
      await responseMsg.edit(`プロジェクト生成を開始しました。\nタスクID: \`${taskId}\`\n\n**仕様**:\n${spec}\n\n_状態: 準備中_`);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`Failed to start project generation: ${(error as { message?: string }).message}`);
        await responseMsg.edit(`プロジェクト生成の開始に失敗しました。エラー: ${(error as { message?: string }).message}`);
      } else {
        logger.error('Failed to start project generation: 不明なエラー');
        await responseMsg.edit('プロジェクト生成の開始に失敗しました。エラー: 不明なエラー');
      }
    }
  }
  
  /**
   * statusコマンド処理
   * @param message メッセージオブジェクト
   * @param taskId タスクID
   */
  private async handleStatusCommand(message: Message, taskId?: string): Promise<void> {
    if (!taskId) {
      await message.reply(`タスクIDを指定してください。例: \`${this.commandPrefix}status 1234-5678-90ab-cdef\``);
      return;
    }
    // AgentCoreにgetTaskが存在しないため、現状は未実装
    await message.reply(`タスクID \`${taskId}\` の状態取得は現在サポートされていません。`);
  }
  
  /**
   * cancelコマンド処理
   * @param message メッセージオブジェクト
   * @param taskId タスクID
   */
  private async handleCancelCommand(message: Message, taskId?: string): Promise<void> {
    if (!taskId) {
      await message.reply(`キャンセルするタスクIDを指定してください。例: \`${this.commandPrefix}cancel 1234-5678-90ab-cdef\``);
      return;
    }

    const result = await this.agentCore.cancelTask(taskId, message.author.id);
    if (result) {
      await message.reply(`タスク \`${taskId}\` をキャンセルしました。`);
    } else {
      await message.reply(`タスク \`${taskId}\` は見つからないか、すでに完了しています。`);
    }
  }
  
  /**
   * 進捗更新リスナー
   * @param task プロジェクトタスク
   * @param message 進捗メッセージ
   * @param isPartial 部分的な更新かどうか（ストリーミング用）
   */
  private async progressListener(task: ProjectTask, message: string, isPartial: boolean = false): Promise<void> {
    try {
      // 保存されている進捗メッセージを取得
      let progressMsg = this.progressMessages.get(task.id);
      if (!progressMsg) {
        // 進捗メッセージが見つからない場合は新規作成してMapに保存
        // channelIdが未定義の場合はエラーを回避
        if (!task.channelId) {
          logger.warn(`No channelId found for task ${task.id}`);
          return;
        }

        const channel = await this.client.channels.fetch(task.channelId);
        if (channel && 'send' in channel && typeof channel.send === 'function') {
          progressMsg = await channel.send(`タスク進捗: ${message}`);
          this.progressMessages.set(task.id, progressMsg);
        } else {
          logger.warn(`No progress message found for task ${task.id} and failed to create new message (channel not found or not sendable)`);
          return;
        }
      }
      
      if (isPartial) {
        await progressMsg.edit(message);
        return;
      }
      
      // 経過時間を計算
      // startTimeが未定義の場合は現在時刻を使用
      const startTime = task.startTime || Date.now();
      const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
      
      // 進捗メッセージを更新
      const spec = task.specification ?? '';
      const statusText = `プロジェクト生成中 - タスクID: \`${task.id}\`\n\n**状態**: ${this.getStatusText(task.status)}\n**経過時間**: ${this.formatDuration(elapsedTime)}\n**現在の処理**: ${message}\n\n**仕様**:\n${spec.slice(0, 200)}${spec.length > 200 ? '...' : ''}`;
      
      await progressMsg.edit(statusText);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`Error updating progress message: ${(error as { message?: string }).message}`);
      } else {
        logger.error('Error updating progress message: 不明なエラー');
      }
    }
  }
  
  /**
   * ステータステキストを取得
   * @param status プロジェクトステータス
   */
  private getStatusText(status: string): string {
    switch (status) {
      case 'pending': return '🕐 準備中';
      case 'planning': return '📖 計画立案中';
      case 'coding': return '💻 コーディング中';
      case 'testing': return '⚙️ テスト中';
      case 'debugging': return '🔧 デバッグ中';
      case 'completed': return '✅ 完了';
      case 'failed': return '❌ 失敗';
      case 'cancelled': return '⛔ キャンセル済み';
      default: return status;
    }
  }
  
  /**
   * 時間形式をフォーマット
   * @param seconds 秒数
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}時間${minutes}分${secs}秒`;
    } else if (minutes > 0) {
      return `${minutes}分${secs}秒`;
    } else {
      return `${secs}秒`;
    }
  }
  
  /**
   * スラッシュコマンドを登録
   * @param clientId ボットのクライアントID
   */
  private async registerCommands(clientId: string): Promise<void> {
    try {
      // getSlashCommandsは存在しないため削除
      // const commands = this.commandHandler.getSlashCommands();
      const commands: any[] = []; // 必要ならコマンド定義をここで記述
      
      const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
      
      logger.info('Registering slash commands...');
      
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      
      logger.info('Slash commands registered successfully');
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`Error registering slash commands: ${(error as { message?: string }).message}`);
      } else {
        logger.error('Error registering slash commands: 不明なエラー');
      }
    }
  }
}
