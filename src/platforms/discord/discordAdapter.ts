/**
 * Discord用プラットフォームアダプター
 */
import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes,
  Events,
  ApplicationCommandOptionType,
  TextChannel,
  CommandInteraction,
  Message,
  ApplicationCommandData
} from 'discord.js';
import { 
  PlatformAdapter, 
  PlatformType, 
  MessageContent, 
  PlatformCommandDefinition,
  PlatformUser,
  PlatformMessage,
  PlatformCommand,
  PlatformCommandOption
} from '../types';
import { config } from '../../config/config';
import { logger } from '../../tools/logger';

export class DiscordAdapter implements PlatformAdapter {
  private client: Client;
  private rest: REST;
  private messageCallback: ((message: PlatformMessage) => Promise<void>) | null = null;
  private commandCallback: ((command: PlatformCommand) => Promise<void>) | null = null;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    this.rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    
    // Discord.jsのイベントハンドラー設定
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // クライアント準備完了イベント
    this.client.on(Events.ClientReady, () => {
      logger.info(`Discordクライアント準備完了: ${this.client.user?.tag}としてログイン`)
      console.log(`Discordクライアント準備完了: ${this.client.user?.tag}としてログイン`);
    });

    // メッセージ受信イベント
    this.client.on(Events.MessageCreate, async (message: Message) => {
      if (message.author.bot) return;
      
      // 許可されたギルドとユーザーのチェック
      const allowedGuildIds = (config.ALLOWED_GUILD_IDS || '').split(',');
      const allowedUserIds = (config.ALLOWED_USER_IDS || '').split(',');
      
      // '*'の場合はすべてのギルドを許可
      if (message.guild && allowedGuildIds[0] !== '*' && !allowedGuildIds.includes(message.guild.id)) return;
      // '*'の場合はすべてのユーザーを許可
      if (allowedUserIds[0] !== '*' && !allowedUserIds.includes(message.author.id)) return;
      
      if (this.messageCallback) {
        const platformMessage: PlatformMessage = {
          id: message.id,
          content: message.content,
          author: {
            id: message.author.id,
            name: message.author.username,
            platformId: message.author.id,
            platformType: PlatformType.DISCORD
          },
          channelId: message.channelId,
          timestamp: message.createdAt,
          attachments: message.attachments.toJSON(),
          platformType: PlatformType.DISCORD,
          rawMessage: message
        };
        
        await this.messageCallback(platformMessage);
      }
    });
    
    // コマンド受信イベント
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isCommand()) return;
      
      // 許可されたギルドとユーザーのチェック
      const allowedGuildIds = (config.ALLOWED_GUILD_IDS || '').split(',');
      const allowedUserIds = (config.ALLOWED_USER_IDS || '').split(',');
      
      // '*'の場合はすべてのギルドを許可
      if (interaction.guild && allowedGuildIds[0] !== '*' && !allowedGuildIds.includes(interaction.guild.id)) return;
      // '*'の場合はすべてのユーザーを許可
      if (allowedUserIds[0] !== '*' && !allowedUserIds.includes(interaction.user.id)) return;
      
      if (this.commandCallback) {
        const options: Record<string, any> = {};
        
        // コマンドオプションの抽出
        interaction.options.data.forEach(option => {
          options[option.name] = option.value;
        });
        
        const platformCommand: PlatformCommand = {
          name: interaction.commandName,
          options,
          user: {
            id: interaction.user.id,
            name: interaction.user.username,
            platformId: interaction.user.id,
            platformType: PlatformType.DISCORD
          },
          channelId: interaction.channelId,
          respondToCommand: async (content: MessageContent) => {
            try {
              const files = content.images?.map((image, index) => {
                return { attachment: image, name: `image${index}.png` };
              }) || [];
              
              if (content.files) {
                content.files.forEach(file => {
                  files.push({ attachment: file.content, name: file.name });
                });
              }
              
              logger.info(`コマンドに応答: ${interaction.commandName} テキスト長: ${(content.text || '').length}`);
              console.log(`Discordコマンドに応答中: ${interaction.commandName}`);

              // 応答済みか確認
              if (interaction.replied) {
                logger.info(`コマンドは既に応答済み: ${interaction.commandName}`);
                await interaction.followUp({
                  content: content.text || '',
                  files,
                  embeds: content.embeds,
                  ephemeral: false
                });
              } else {
                await interaction.reply({
                  content: content.text || '',
                  files,
                  embeds: content.embeds,
                  ephemeral: false
                });
              }
            } catch (error) {
              const errorMessage = `Error responding to Discord command ${interaction.commandName}: ${(error as Error).message}`;
              logger.error(errorMessage);
              console.error(errorMessage);
              
              // エラー時にフォールバックを試行
              try {
                if (!interaction.replied && !interaction.deferred) {
                  await interaction.reply({
                    content: `コマンド実行中にエラーが発生しました: ${(error as Error).message}`,
                    ephemeral: true
                  });
                }
              } catch (followupError) {
                logger.error(`Failed to send error response: ${(followupError as Error).message}`);
              }
            }
          },
          platformType: PlatformType.DISCORD,
          rawCommand: interaction
        };
        
        await this.commandCallback(platformCommand);
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Discordアダプターを初期化中...');
      console.log('Discordアダプターを初期化中...');
      
      // Discord.js、エラーイベントの設定
      this.client.on('error', (error) => {
        logger.error('Discordクライアントエラー:', error);
        console.error('Discordクライアントエラー:', error);
      });
      
      await this.client.login(config.DISCORD_TOKEN);
      logger.info(`Discordトークンでログイン成功: ${config.DISCORD_TOKEN.substring(0, 10)}...`);
      logger.info('Discord adapter initialized successfully');
    } catch (error) {
      const errorMessage = `Failed to initialize Discord adapter: ${(error as Error).message}`;
      logger.error(errorMessage);
      console.error(errorMessage);
      throw error;
    }
  }

  async sendMessage(channelId: string, content: MessageContent): Promise<string | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        throw new Error(`Invalid channel ID: ${channelId}`);
      }
      
      const files = content.images?.map((image, index) => {
        return { attachment: image, name: `image${index}.png` };
      }) || [];
      
      if (content.files) {
        content.files.forEach(file => {
          files.push({ attachment: file.content, name: file.name });
        });
      }
      
      const message = await channel.send({
        content: content.text || '',
        files,
        embeds: content.embeds
      });
      
      return message.id;
    } catch (error) {
      logger.error('Error sending message to Discord:', error);
      return null;
    }
  }

  async updateMessage(channelId: string, messageId: string, content: MessageContent): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        throw new Error(`Invalid channel ID: ${channelId}`);
      }
      
      const message = await channel.messages.fetch(messageId);
      if (!message) {
        throw new Error(`Invalid message ID: ${messageId}`);
      }
      
      const files = content.images?.map((image, index) => {
        return { attachment: image, name: `image${index}.png` };
      }) || [];
      
      if (content.files) {
        content.files.forEach(file => {
          files.push({ attachment: file.content, name: file.name });
        });
      }
      
      await message.edit({
        content: content.text || '',
        files,
        embeds: content.embeds
      });
      
      return true;
    } catch (error) {
      logger.error('Error updating Discord message:', error);
      return false;
    }
  }

  async registerCommands(commands: PlatformCommandDefinition[]): Promise<void> {
    try {
      logger.info(`Discordコマンド登録開始: ${commands.length}件のコマンド`);
      console.log(`Discordコマンド登録開始: ${commands.length}件のコマンド`);

      // コマンドの変換とデバッグログ
      const discordCommands: ApplicationCommandData[] = commands.map(command => {
        logger.info(`コマンド変換中: ${command.name}, オプション数: ${command.options?.length || 0}`);
        return {
          name: command.name,
          description: command.description,
          options: command.options?.map(option => this.convertCommandOption(option)) || []
        };
      });
      
      // 登録前のJSONデータのログ出力
      logger.info('Discordコマンド登録データ:', JSON.stringify(discordCommands, null, 2));
      
      // グローバルコマンドとしてアプリケーションコマンドを登録
      console.log(`Discordコマンドを送信中: ${config.DISCORD_CLIENT_ID}`);
      const response = await this.rest.put(
        Routes.applicationCommands(config.DISCORD_CLIENT_ID),
        { body: discordCommands }
      );
      
      logger.info('Discord commands registered successfully');
      console.log('Discordコマンド登録成功');
    } catch (error) {
      const errorMessage = `Error registering Discord commands: ${(error as Error).message}`;
      logger.error(errorMessage);
      logger.error('Error details:', error);
      console.error(errorMessage);
      throw error;
    }
  }

  private convertCommandOption(option: PlatformCommandOption): any {
    const discordOption: any = {
      name: option.name,
      description: option.description,
      required: option.required,
    };
    
    // オプションタイプの変換
    switch (option.type) {
      case 'string':
        discordOption.type = ApplicationCommandOptionType.String;
        break;
      case 'integer':
        discordOption.type = ApplicationCommandOptionType.Integer;
        break;
      case 'boolean':
        discordOption.type = ApplicationCommandOptionType.Boolean;
        break;
      case 'user':
        discordOption.type = ApplicationCommandOptionType.User;
        break;
      case 'channel':
        discordOption.type = ApplicationCommandOptionType.Channel;
        break;
      default:
        discordOption.type = ApplicationCommandOptionType.String;
    }
    
    // 選択肢がある場合
    if (option.choices) {
      discordOption.choices = option.choices;
    }
    
    return discordOption;
  }

  async getUser(userId: string): Promise<PlatformUser | null> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) return null;
      
      return {
        id: user.id,
        name: user.username,
        platformId: user.id,
        platformType: PlatformType.DISCORD
      };
    } catch (error) {
      logger.error('Error fetching Discord user:', error);
      return null;
    }
  }

  getAdapterType(): PlatformType {
    return PlatformType.DISCORD;
  }

  onMessageCreate(callback: (message: PlatformMessage) => Promise<void>): void {
    this.messageCallback = callback;
  }

  onCommandReceived(callback: (command: PlatformCommand) => Promise<void>): void {
    this.commandCallback = callback;
  }
}
