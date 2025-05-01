/**
 * プラットフォームマネージャー
 * 複数のメッセージングプラットフォームのアダプターを管理
 */
import { PlatformAdapter, PlatformCommandDefinition, PlatformMessage, PlatformCommand, MessageContent } from './types';
import { PlatformType, NotificationTarget } from '../../types/agentTypes';
import { DiscordAdapter } from './discord/discordAdapter';
import { SlackAdapter } from './slack/slackAdapter';
import { config } from '../../config/config';
import logger from '../../utils/logger';

export class PlatformManager {
  private adapters: Map<PlatformType, PlatformAdapter> = new Map();
  private static instance: PlatformManager;
  private messageHandlers: ((message: PlatformMessage) => Promise<void>)[] = [];
  private commandHandlers: ((command: PlatformCommand) => Promise<void>)[] = [];

  private constructor() {}

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): PlatformManager {
    if (!PlatformManager.instance) {
      PlatformManager.instance = new PlatformManager();
    }
    return PlatformManager.instance;
  }

  /**
   * すべてのプラットフォームアダプターを初期化
   */
  async initializeAdapters(): Promise<void> {
    logger.info('Initializing platform adapters...');
    
    // 有効なプラットフォームを設定から読み込み
    if (config.ENABLE_DISCORD !== 'false') {
      logger.info('Discord adapter enabled');
      try {
        const discordAdapter = new DiscordAdapter();
        await discordAdapter.initialize();
        
        // メッセージとコマンドのコールバック設定
        discordAdapter.onMessageCreate(this.handlePlatformMessage.bind(this));
        discordAdapter.onCommandReceived(this.handlePlatformCommand.bind(this));
        
        this.adapters.set(PlatformType.DISCORD, discordAdapter);
        logger.info('Discord adapter initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Discord adapter:', error);
      }
    } else {
      logger.info('Discord adapter disabled');
    }

    if (config.ENABLE_SLACK === 'true') {
      logger.info('Slack adapter enabled');
      try {
        const slackAdapter = new SlackAdapter();
        await slackAdapter.initialize();
        
        // メッセージとコマンドのコールバック設定
        slackAdapter.onMessageCreate(this.handlePlatformMessage.bind(this));
        slackAdapter.onCommandReceived(this.handlePlatformCommand.bind(this));
        
        this.adapters.set(PlatformType.SLACK, slackAdapter);
        logger.info('Slack adapter initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Slack adapter:', error);
      }
    } else {
      logger.info('Slack adapter disabled');
    }
    
    if (this.adapters.size === 0) {
      throw new Error('No platform adapters were successfully initialized');
    }
    
    logger.info(`Initialized ${this.adapters.size} platform adapters`);
  }

  /**
   * 特定のプラットフォームのアダプターを取得
   */
  getAdapter(platformType: PlatformType): PlatformAdapter | undefined {
    return this.adapters.get(platformType);
  }

  /**
   * すべてのアダプターを取得
   */
  getAllAdapters(): PlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * すべてのプラットフォームにコマンドを登録
   */
  async registerCommandsToAllPlatforms(commands: PlatformCommandDefinition[]): Promise<void> {
    const errors: Error[] = [];
    
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.registerCommands(commands);
        logger.info(`Commands registered successfully for ${adapter.getAdapterType()} platform`);
      } catch (error) {
        logger.error(`Failed to register commands for ${adapter.getAdapterType()} platform:`, error);
        errors.push(error as Error);
      }
    }
    
    if (errors.length > 0 && errors.length === this.adapters.size) {
      throw new Error('Failed to register commands on all platforms');
    }
  }

  /**
   * プラットフォームメッセージのハンドラーを追加
   */
  addMessageHandler(handler: (message: PlatformMessage) => Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  /**
   * プラットフォームコマンドのハンドラーを追加
   */
  addCommandHandler(handler: (command: PlatformCommand) => Promise<void>): void {
    this.commandHandlers.push(handler);
  }

  /**
   * プラットフォームメッセージを処理
   */
  private async handlePlatformMessage(message: PlatformMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        logger.error('Error in message handler:', error);
      }
    }
  }

  /**
   * プラットフォームコマンドを処理
   */
  private async handlePlatformCommand(command: PlatformCommand): Promise<void> {
    for (const handler of this.commandHandlers) {
      try {
        await handler(command);
      } catch (error) {
        logger.error('Error in command handler:', error);
      }
    }
  }

  /**
   * 指定したターゲットにメッセージを送信
   */
  async sendMessage(target: NotificationTarget, content: MessageContent): Promise<string | null> {
    const adapter = this.adapters.get(target.platformType);
    if (!adapter) {
      logger.error(`No adapter found for platform type: ${target.platformType}`);
      return null;
    }

    const hasText = !!content.text;
    const hasFiles = !!(content.files && content.files.length > 0);

    try {
      if (hasText && hasFiles) {
        // テキスト送信
        const textId = await adapter.sendMessage(target.channelId, { text: content.text });
        // ファイル送信
        await adapter.sendMessage(target.channelId, { files: content.files });
        return textId;
      } else if (hasText) {
        return await adapter.sendMessage(target.channelId, { text: content.text });
      } else if (hasFiles) {
        return await adapter.sendMessage(target.channelId, { files: content.files });
      } else {
        logger.warn('sendMessage called with empty content');
        return null;
      }
    } catch (error) {
      logger.error(`Error sending message to ${target.platformType}:`, error);
      return null;
    }
  }

  /**
   * 指定したターゲットのメッセージを更新
   */
  async updateMessage(target: NotificationTarget, messageId: string, content: MessageContent): Promise<boolean> {
    const adapter = this.adapters.get(target.platformType);
    if (!adapter) {
      logger.error(`No adapter found for platform type: ${target.platformType}`);
      return false;
    }

    const hasText = !!content.text;
    const hasFiles = !!(content.files && content.files.length > 0);

    try {
      if (hasText && hasFiles) {
        // テキスト更新
        const textResult = await adapter.updateMessage(target.channelId, messageId, { text: content.text });
        // ファイル更新
        const filesResult = await adapter.updateMessage(target.channelId, messageId, { files: content.files });
        return textResult && filesResult;
      } else if (hasText) {
        return await adapter.updateMessage(target.channelId, messageId, { text: content.text });
      } else if (hasFiles) {
        return await adapter.updateMessage(target.channelId, messageId, { files: content.files });
      } else {
        logger.warn('updateMessage called with empty content');
        return false;
      }
    } catch (error) {
      logger.error(`Error updating message on ${target.platformType}:`, error);
      return false;
    }
  }
}
