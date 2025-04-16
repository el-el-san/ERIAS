import { Client, Events, GatewayIntentBits, Message, TextChannel, AttachmentBuilder } from 'discord.js';
import { AgentCore } from '../agent/agentCore';
import { ProjectTask, ProgressListener } from '../agent/types';
import logger from '../utils/logger';
import config from '../config/config';
import path from 'path';
import fs from 'fs';
import { GeminiClient } from '../llm/geminiClient';
import { FeedbackMessageHandler } from './feedbackMessageHandler';
import { conversationManager } from '../llm/conversationManager';

/**
 * Discordボットインターフェイス
 * ユーザーとの対話、コマンド処理、進捗通知を担当
 */
export class DiscordBot {
  private client: Client;
  private agentCore: AgentCore;
  private feedbackHandler: FeedbackMessageHandler;
  private commandPrefix: string = '/';
  private isReady: boolean = false;
  
  // 進行中プロジェクトの状態メッセージ
  private progressMessages: Map<string, Message> = new Map();
  
  /**
   * DiscordBotを初期化
   * @param agentCore AIエージェントコア
   */
  constructor(agentCore: AgentCore) {
    this.agentCore = agentCore;
    this.feedbackHandler = new FeedbackMessageHandler(agentCore);
    
    // Discordクライアントを初期化
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });
    
    // イベントリスナーを設定
    this.setupEventListeners();
    
    // 進捗通知リスナーを登録
    this.agentCore.addProgressListener(this.progressListener.bind(this));
  }
  
  /**
   * Discordボットを起動
   */
  public async start(): Promise<void> {
    try {
      logger.info('Starting Discord bot...');
      await this.client.login(config.discord.token);
      logger.info('Discord bot started successfully');
    } catch (error) {
      logger.error(`Failed to start Discord bot: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * Discordボットを停止
   */
  public async stop(): Promise<void> {
    try {
      logger.info('Stopping Discord bot...');
      await this.client.destroy();
      logger.info('Discord bot stopped successfully');
    } catch (error) {
      logger.error(`Error stopping Discord bot: ${(error as Error).message}`);
    }
  }
  
  /**
   * イベントリスナーを設定
   */
  private setupEventListeners(): void {
    // ボット起動完了イベント
    this.client.once(Events.ClientReady, (client) => {
      this.isReady = true;
      logger.info(`Discord bot logged in as ${client.user.tag}`);
    });
    
    // メッセージ受信イベント
    this.client.on(Events.MessageCreate, this.handleMessage.bind(this));
    
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
    // ボットのメッセージは無視
    if (message.author.bot) return;
    
    // DMは無視（サーバーのみ対応）
    if (!message.guild) return;
    
    // 許可されたギルド/サーバーIDのチェック
    if (config.discord.allowedGuildIds.length > 0 && 
        !config.discord.allowedGuildIds.includes(message.guild.id)) {
      logger.warn(`Message from non-allowed guild: ${message.guild.id}`);
      return;
    }
    
    // 許可されたユーザーIDのチェック
    if (config.discord.allowedUserIds.length > 0 && 
        !config.discord.allowedUserIds.includes(message.author.id)) {
      logger.warn(`Message from non-allowed user: ${message.author.id}`);
      return;
    }
    
    // task:IDフォーマットのフィードバックメッセージを処理
    if (message.content.includes('task:')) {
      const handled = await this.feedbackHandler.handleMessage(message);
      if (handled) return;
    }
    
    // コマンドプレフィックスで始まるかチェック
    if (message.content.startsWith(this.commandPrefix)) {
      // コマンドと引数を分離
      const args = message.content.slice(this.commandPrefix.length).trim().split(/ +/);
      const command = args.shift()?.toLowerCase();
      
      await this.handleCommand(message, command, args);
    } else {
      // コマンドではない通常のメッセージの場合、LLMと会話
      await this.handleConversation(message);
    }
  }
  
  /**
   * コマンド処理
   * @param message メッセージオブジェクト
   * @param command コマンド名
   * @param args コマンド引数
   */
  private async handleCommand(message: Message, command?: string, args: string[] = []): Promise<void> {
    
    try {
      // コマンド処理
      switch (command) {
        case 'help':
          await this.handleHelpCommand(message);
          break;
        
        case 'new':
        case 'newproject':
          await this.handleNewProjectCommand(message, args.join(' '));
          break;
        
        case 'status':
          await this.handleStatusCommand(message, args[0]);
          break;
        
        case 'cancel':
          await this.handleCancelCommand(message, args[0]);
          break;
          
        case 'clear':
          await this.handleClearCommand(message);
          break;
        
        default:
          // 不明なコマンド
          if (command) {
            await message.reply(`不明なコマンドです: \`${command}\`\nヘルプを表示するには \`${this.commandPrefix}help\` と入力してください。`);
          }
      }
    } catch (error) {
      logger.error(`Error handling command ${command}: ${(error as Error).message}`);
      await message.reply(`コマンド実行中にエラーが発生しました: ${(error as Error).message}`);
    }
  }
  
  /**
   * LLMとの会話処理
   * @param message メッセージオブジェクト
   */
  private async handleConversation(message: Message): Promise<void> {
    try {
      // Geminiクライアントからインスタンスを取得
      const geminiClient = new GeminiClient();
      
      // システムプロンプト
      const systemPrompt = "あなたはフレンドリーなアシスタントです。ユーザーからの質問に簡潔かつ役立つ形で答えてください。コードが必要な場合は実用的なコード例を提供してください。前回までの会話を考慮して対応してください。";
      
      // 会話履歴を取得
      const history = conversationManager.getConversationHistory(
        message.author.id,
        message.channel.id
      );
      
      // LLMにメッセージを送信
      logger.info(`Sending conversation to LLM from user ${message.author.tag}: ${message.content.substring(0, 100)}...`);
      const response = await geminiClient.generateContent(
        message.content,
        systemPrompt,
        undefined,
        60000, // 60秒タイムアウト
        history
      );
      
      // 会話履歴にユーザーのメッセージを追加
      conversationManager.addMessage(
        message.author.id,
        message.channel.id,
        message.guild ? message.guild.id : 'dm',
        message.content,
        false // ユーザーメッセージ
      );
      
      // 会話履歴にAIのメッセージを追加
      conversationManager.addMessage(
        message.author.id,
        message.channel.id,
        message.guild ? message.guild.id : 'dm',
        response,
        true // AIのメッセージ
      );
      
      // 応答が長すぎる場合は分割して送信
      const maxMessageLength = 2000; // Discordの最大メッセージ長
      
      if (response.length <= maxMessageLength) {
        await message.reply(response);
      } else {
        // 長いメッセージを分割
        let remainingText = response;
        
        while (remainingText.length > 0) {
          // 最大長までのチャンクを取得
          const chunkSize = Math.min(remainingText.length, maxMessageLength);
          let chunk = remainingText.substring(0, chunkSize);
          
          // コードブロックやマークダウンを分割しないようにする
          if (chunkSize < remainingText.length && !chunk.endsWith('\n')) {
            const lastNewline = chunk.lastIndexOf('\n');
            if (lastNewline > chunkSize * 0.8) { // 最大長の80%以降に改行があればそこで分割
              chunk = chunk.substring(0, lastNewline + 1);
            }
          }
          
          // 分割した各チャンクは返信として送信
          await message.reply(chunk);
          remainingText = remainingText.substring(chunk.length);
        }
      }
      
    } catch (error) {
      logger.error(`Error in conversation with LLM: ${(error as Error).message}`);
      await message.reply(`すみません、会話処理中にエラーが発生しました: ${(error as Error).message}`);
    }
  }
  
  /**
   * 会話履歴クリアコマンド処理
   * @param message メッセージオブジェクト
   */
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
      logger.error(`Error clearing conversation history: ${(error as Error).message}`);
      await message.reply(`会話履歴のクリア中にエラーが発生しました: ${(error as Error).message}`);
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
   */
  private async handleNewProjectCommand(message: Message, spec: string): Promise<void> {
    if (!spec || spec.trim().length === 0) {
      await message.reply(`プロジェクトの仕様を指定してください。例: \`${this.commandPrefix}new Reactを使ったTODOアプリ\``);
      return;
    }
    
    // 応答メッセージを送信
    const responseMsg = await message.reply('プロジェクト生成リクエストを受け付けました。処理を開始します...');
    
    // タスクを作成
    const task = this.agentCore.createTask(
      message.author.id,
      message.guild!.id,
      message.channel.id,
      spec
    );
    
    // 進捗メッセージを保存
    this.progressMessages.set(task.id, responseMsg);
    
    // タスクIDを通知
    await responseMsg.edit(`プロジェクト生成を開始しました。\nタスクID: \`${task.id}\`\n\n**仕様**:\n${spec}\n\n_状態: 準備中_`);
    
    try {
      // 非同期でプロジェクト生成を実行
      this.agentCore.generateProject(task).then(async (zipPath) => {
        try {
          // ZIPファイルをDiscordに送信
          const zipFile = new AttachmentBuilder(zipPath, { name: `${path.basename(zipPath)}` });
          
          await (message.channel as TextChannel).send({
            content: `<@${message.author.id}> プロジェクト生成が完了しました。`,
            files: [zipFile]
          });
          
          // 一時ファイルを削除
          setTimeout(() => {
            try {
              fs.unlinkSync(zipPath);
              logger.debug(`Removed temporary zip file: ${zipPath}`);
            } catch (err) {
              logger.error(`Failed to remove temporary zip file: ${(err as Error).message}`);
            }
          }, 5000);
        } catch (error) {
          logger.error(`Failed to send zip file: ${(error as Error).message}`);
          await (message.channel as TextChannel).send(`<@${message.author.id}> ZIPファイルの送信に失敗しました。エラー: ${(error as Error).message}`);
        }
      }).catch(async (error) => {
        logger.error(`Project generation failed: ${error.message}`);
        await (message.channel as TextChannel).send(`<@${message.author.id}> プロジェクト生成に失敗しました。エラー: ${error.message}`);
      });
    } catch (error) {
      logger.error(`Failed to start project generation: ${(error as Error).message}`);
      await responseMsg.edit(`プロジェクト生成の開始に失敗しました。エラー: ${(error as Error).message}`);
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
    
    const task = this.agentCore.getTask(taskId);
    if (!task) {
      await message.reply(`タスクID \`${taskId}\` は見つかりませんでした。`);
      return;
    }
    
    const elapsedTime = Math.floor((Date.now() - task.startTime) / 1000);
    const statusText = `
**プロジェクト: \`${taskId}\`**

状態: ${this.getStatusText(task.status)}
開始時間: <t:${Math.floor(task.startTime / 1000)}:R>
経過時間: ${this.formatDuration(elapsedTime)}
現在の処理: ${task.currentAction || '不明'}
`;
    
    await message.reply(statusText);
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
    
    const result = await this.agentCore.cancelTask(taskId);
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
   */
  private async progressListener(task: ProjectTask, message: string): Promise<void> {
    try {
      // 保存されている進捗メッセージを取得
      const progressMsg = this.progressMessages.get(task.id);
      if (!progressMsg) {
        logger.warn(`No progress message found for task ${task.id}`);
        return;
      }
      
      // 経過時間を計算
      const elapsedTime = Math.floor((Date.now() - task.startTime) / 1000);
      
      // 進捗メッセージを更新
      const statusText = `プロジェクト生成中 - タスクID: \`${task.id}\`\n\n**状態**: ${this.getStatusText(task.status)}\n**経過時間**: ${this.formatDuration(elapsedTime)}\n**現在の処理**: ${message}\n\n**仕様**:\n${task.specification.slice(0, 200)}${task.specification.length > 200 ? '...' : ''}`;
      
      await progressMsg.edit(statusText);
    } catch (error) {
      logger.error(`Error updating progress message: ${(error as Error).message}`);
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
}