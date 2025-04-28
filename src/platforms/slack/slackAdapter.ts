/**
 * Slack用プラットフォームアダプター
 */
import { App, LogLevel } from '@slack/bolt';
import { 
  PlatformAdapter, 
  PlatformType, 
  MessageContent, 
  PlatformCommandDefinition,
  PlatformUser,
  PlatformMessage,
  PlatformCommand
} from '../types';
import { config } from '../../config/config';
import { logger } from '../../tools/logger';

export class SlackAdapter implements PlatformAdapter {
  private app: App;
  private messageCallback: ((message: PlatformMessage) => Promise<void>) | null = null;
  private commandCallback: ((command: PlatformCommand) => Promise<void>) | null = null;
  private allowedChannelIds: string[] = [];

  constructor() {
    // Slack Bolt アプリの初期化
    this.app = new App({
      token: config.SLACK_BOT_TOKEN,
      signingSecret: config.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: config.SLACK_APP_TOKEN,
      logLevel: LogLevel.INFO
    });
    
    // 許可されたチャンネルIDの設定
    this.allowedChannelIds = (config.SLACK_ALLOWED_CHANNEL_IDS || '').split(',');
    
    // イベントハンドラーの設定
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // メッセージ受信イベント
    this.app.event('message', async ({ event, say }) => {
      // 型ガード: event.user, event.channel, event.ts, event.text, event.files
      if (typeof event !== 'object' || !event) return;
      // ボットメッセージは無視
      if ('bot_id' in event && event.bot_id) return;
      // 許可されたチャンネルチェック（設定されている場合）
      if (
        this.allowedChannelIds.length > 0 &&
        (!('channel' in event) || !this.allowedChannelIds.includes(event.channel as string))
      ) {
        return;
      }
      // 必須プロパティの型ガード
      if (
        !('user' in event) ||
        typeof event.user !== 'string' ||
        !('channel' in event) ||
        typeof event.channel !== 'string' ||
        !('ts' in event) ||
        typeof event.ts !== 'string'
      ) {
        logger.warn('Slack event missing required properties:', event);
        return;
      }
      if (this.messageCallback) {
        try {
          // ユーザー情報の取得
          const userInfo = await this.app.client.users.info({ user: event.user });
          const platformMessage: PlatformMessage = {
            id: event.ts,
            content: typeof event.text === 'string' ? event.text : '',
            author: {
              id: event.user,
              name: userInfo.user?.name || event.user,
              platformId: event.user,
              platformType: PlatformType.SLACK
            },
            channelId: event.channel,
            timestamp: new Date(parseInt(event.ts) * 1000),
            attachments: ('files' in event && Array.isArray((event as any).files)) ? (event as any).files : [],
            platformType: PlatformType.SLACK,
            rawMessage: event
          };
          await this.messageCallback(platformMessage);
        } catch (error) {
          logger.error('Error processing Slack message:', error);
        }
      }
    });
    
    // スラッシュコマンド処理
    this.app.command(/\/.*/, async ({ command, ack, respond }) => {
      // コマンド受信の確認応答
      await ack();
      
      // 許可されたチャンネルチェック（設定されている場合）
      if (this.allowedChannelIds.length > 0 && !this.allowedChannelIds.includes(command.channel_id)) {
        return;
      }
      
      if (this.commandCallback) {
        try {
          // コマンド名の抽出（先頭の / を削除）
          const commandName = command.command.substring(1);
          
          // オプションのパース
          const text = command.text || '';
          const options: Record<string, any> = {};
          
          // 単純なスペース区切りオプションとして処理（実際の実装ではより洗練されたパーサーが必要）
          // format: key=value key2=value2
          const optionPairs = text.match(/(\w+)=("[^"]+"|[^\s]+)/g) || [];
          optionPairs.forEach(pair => {
            const [key, rawValue] = pair.split('=');
            // ダブルクォートを削除
            const value = rawValue.replace(/^"(.*)"$/, '$1');
            options[key] = value;
          });
          
          // ユーザー情報の取得
          const userInfo = await this.app.client.users.info({ user: command.user_id });
          
          const platformCommand: PlatformCommand = {
            name: commandName,
            options,
            user: {
              id: command.user_id,
              name: userInfo.user?.name || command.user_id,
              platformId: command.user_id,
              platformType: PlatformType.SLACK
            },
            channelId: command.channel_id,
            respondToCommand: async (content: MessageContent) => {
              try {
                const blocks = [];
                
                // テキスト内容がある場合
                if (content.text) {
                  blocks.push({
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: content.text
                    }
                  });
                }
                
                // ファイルアップロード（画像や添付ファイル）
                const uploadPromises = [];
                
                if (content.images && content.images.length > 0) {
                  for (const image of content.images) {
                    uploadPromises.push(
                      this.app.client.files.upload({
                        channels: command.channel_id,
                        initial_comment: 'Image from ERIAS',
                        file: image,
                        filename: 'image.png'
                      })
                    );
                  }
                }
                
                if (content.files && content.files.length > 0) {
                  for (const file of content.files) {
                    uploadPromises.push(
                      this.app.client.files.upload({
                        channels: command.channel_id,
                        initial_comment: file.name,
                        file: file.content,
                        filename: file.name
                      })
                    );
                  }
                }
                
                // メッセージ送信
                await respond({
                  blocks,
                  text: content.text || 'Response from ERIAS'
                });
                
                // ファイルアップロードの完了を待つ
                if (uploadPromises.length > 0) {
                  await Promise.all(uploadPromises);
                }
              } catch (error) {
                logger.error('Error responding to Slack command:', error);
              }
            },
            platformType: PlatformType.SLACK,
            rawCommand: command
          };
          
          await this.commandCallback(platformCommand);
        } catch (error) {
          logger.error('Error processing Slack command:', error);
          await respond({
            text: 'エラーが発生しました。しばらく経ってからもう一度お試しください。'
          });
        }
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.app.start(config.SLACK_PORT || 3000);
      logger.info(`Slack adapter initialized successfully on port ${config.SLACK_PORT || 3000}`);
    } catch (error) {
      logger.error('Failed to initialize Slack adapter:', error);
      throw error;
    }
  }

  async sendMessage(channelId: string, content: MessageContent): Promise<string | null> {
    try {
      const blocks = [];
      
      // テキスト内容がある場合
      if (content.text) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: content.text
          }
        });
      }
      
      // メッセージ送信
      const result = await this.app.client.chat.postMessage({
        channel: channelId,
        text: content.text || 'Message from ERIAS',
        blocks: blocks.length > 0 ? blocks : undefined
      });
      
      // ファイルアップロード（画像や添付ファイル）
      if (content.images && content.images.length > 0) {
        for (const image of content.images) {
          await this.app.client.files.upload({
            channels: channelId,
            thread_ts: result.ts,
            file: image,
            filename: 'image.png'
          });
        }
      }
      
      if (content.files && content.files.length > 0) {
        for (const file of content.files) {
          await this.app.client.files.upload({
            channels: channelId,
            thread_ts: result.ts,
            file: file.content,
            filename: file.name
          });
        }
      }
      
      return result.ts as string;
    } catch (error) {
      logger.error('Error sending message to Slack:', error);
      return null;
    }
  }

  async updateMessage(channelId: string, messageId: string, content: MessageContent): Promise<boolean> {
    try {
      const blocks = [];
      
      // テキスト内容がある場合
      if (content.text) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: content.text
          }
        });
      }
      
      // メッセージ更新
      await this.app.client.chat.update({
        channel: channelId,
        ts: messageId,
        text: content.text || 'Updated message from ERIAS',
        blocks: blocks.length > 0 ? blocks : undefined
      });
      
      // Slackでは既存メッセージの添付ファイルを更新できないため、
      // 新しいファイルが含まれている場合は追加で送信
      if (content.images && content.images.length > 0) {
        for (const image of content.images) {
          await this.app.client.files.upload({
            channels: channelId,
            thread_ts: messageId,
            file: image,
            filename: 'image.png'
          });
        }
      }
      
      if (content.files && content.files.length > 0) {
        for (const file of content.files) {
          await this.app.client.files.upload({
            channels: channelId,
            thread_ts: messageId,
            file: file.content,
            filename: file.name
          });
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Error updating Slack message:', error);
      return false;
    }
  }

  async registerCommands(commands: PlatformCommandDefinition[]): Promise<void> {
    try {
      // Slackの場合、Manifestを通じてコマンドを登録する必要がある
      // このメソッドでは、コマンドの登録方法についてログを出力
      logger.info('Registering Slack commands...');
      logger.info('Note: Slack commands must be registered in the Slack API dashboard.');
      logger.info('Please update your Slack app manifest with the following commands:');
      
      commands.forEach(command => {
        logger.info(`/${command.name} - ${command.description}`);
      });
      
      // 実際の実装では、Slack APIを使用してコマンドを動的に登録する方法もある
      // しかし、多くの場合、マニフェストを通じて手動で設定することが一般的
    } catch (error) {
      logger.error('Error registering Slack commands:', error);
      throw error;
    }
  }

  async getUser(userId: string): Promise<PlatformUser | null> {
    try {
      const result = await this.app.client.users.info({ user: userId });
      if (!result.user) return null;
      
      return {
        id: userId,
        name: result.user.name || userId,
        platformId: userId,
        platformType: PlatformType.SLACK
      };
    } catch (error) {
      logger.error('Error fetching Slack user:', error);
      return null;
    }
  }

  getAdapterType(): PlatformType {
    return PlatformType.SLACK;
  }

  onMessageCreate(callback: (message: PlatformMessage) => Promise<void>): void {
    this.messageCallback = callback;
  }

  onCommandReceived(callback: (command: PlatformCommand) => Promise<void>): void {
    this.commandCallback = callback;
  }
}
