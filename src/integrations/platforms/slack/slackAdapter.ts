/**
 * Slack用プラットフォームアダプター
 */
import { App, LogLevel } from '@slack/bolt';
import {
  PlatformAdapter,
  MessageContent,
  PlatformCommandDefinition,
  PlatformUser,
  PlatformMessage,
  PlatformCommand
} from '../types';
import { PlatformType } from '../../../types/agentTypes';
import { config } from '../../../config/config';
import logger, { logError } from '../../../utils/logger';

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
    this.app.message(/.*/i, async ({ message, say }) => {
      // デバッグログ追加
      logger.debug(`Slack message received: ${JSON.stringify(message)}`);
      
      // 型ガード: message.user, message.channel, message.ts, message.text, message.files
      if (typeof message !== 'object' || !message) return;
      // ボットメッセージは無視
      if ('bot_id' in message && message.bot_id) {
        logger.debug(`Ignoring bot message with bot_id: ${message.bot_id}`);
        return;
      }
      // 許可されたチャンネルチェック（設定されている場合）
      if (
        this.allowedChannelIds.length > 0 &&
        (!('channel' in message) || !this.allowedChannelIds.includes(message.channel as string))
      ) {
        logger.debug(`Message from non-allowed channel: ${(message as any).channel}`);
        return;
      }
      // 必須プロパティの型ガード
      if (
        !('user' in message) ||
        typeof message.user !== 'string' ||
        !('channel' in message) ||
        typeof message.channel !== 'string' ||
        !('ts' in message) ||
        typeof message.ts !== 'string'
      ) {
        logger.warn('Slack message missing required properties:', message);
        return;
      }
      
      if (this.messageCallback) {
        try {
          // ユーザー情報の取得
          const userInfo = await this.app.client.users.info({ user: message.user });
          const platformMessage: PlatformMessage = {
            id: message.ts,
            content: typeof message.text === 'string' ? message.text : '',
            author: {
              id: message.user,
              name: userInfo.user?.name || message.user,
              platformId: message.user,
              platformType: PlatformType.SLACK
            },
            channelId: message.channel,
            timestamp: new Date(parseInt(message.ts) * 1000),
            attachments: ('files' in message && Array.isArray((message as any).files)) ? (message as any).files : [],
            platformType: PlatformType.SLACK,
            rawMessage: message
          };
          
          // 自動返信テスト用（後で削除）
          await say(`デバッグ: メッセージを受信しました「${message.text}」`);
          
          // メッセージコールバックの実行
          await this.messageCallback(platformMessage);
        } catch (error) {
          logError(String(error), 'Error processing Slack message:');
          // エラー情報を詳細に記録
          if (error instanceof Error) {
            logError(`Error details: ${error.message}\n${error.stack}`);
          }
        }
      } else {
        logger.warn('Message callback not registered');
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

          // key=value形式が1つもなければ全文をspecに格納
          if (optionPairs.length === 0) {
            options['spec'] = text;
          }
          
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
                      this.app.client.files.uploadV2({
                        channel_id: command.channel_id,
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
                      this.app.client.files.uploadV2({
                        channel_id: command.channel_id,
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
                logError(String(error), 'Error responding to Slack command:');
              }
            },
            platformType: PlatformType.SLACK,
            rawCommand: command
          };
          
          await this.commandCallback(platformCommand);
        } catch (error) {
          logError(String(error), 'Error processing Slack command:');
          await respond({
            text: 'エラーが発生しました。しばらく経ってからもう一度お試しください。'
          });
        }
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      // サーバー起動前にボットユーザーIDを取得
      try {
        // BoltのClientは初期化時にtokenSet済み
        const authResult = await this.app.client.auth.test();
        logger.info(`Slack bot authenticated as: ${authResult.user} (ID: ${authResult.user_id})`);
        
        // ボット情報の詳細を取得
        const botInfo = await this.app.client.users.info({ user: authResult.user_id as string });
        logger.info(`Slack bot details - Name: ${botInfo.user?.name}, Real name: ${botInfo.user?.real_name}`);
      } catch (authError) {
        logError(String(authError), 'Failed to get Slack bot auth info:');
      }
      
      // サーバー起動
      await this.app.start(config.SLACK_PORT || 3000);
      logger.info(`Slack adapter initialized successfully on port ${config.SLACK_PORT || 3000}`);
      
      // 許可チャンネルの設定を記録
      if (this.allowedChannelIds.length > 0) {
        logger.info(`Slack allowed channel IDs: ${this.allowedChannelIds.join(', ')}`);
      } else {
        logger.info('Slack allowed channel IDs: All channels');
      }
    } catch (error) {
      logError(String(error), 'Failed to initialize Slack adapter:');
      throw error;
    }
  }

  async sendMessage(channelId: string, content: MessageContent): Promise<string | null> {
    try {
      // テキスト・ファイル・画像の有無を判定
      const hasText = !!content.text;
      const hasImages = content.images && content.images.length > 0;
      const hasFiles = content.files && content.files.length > 0;

      // 何も送信するものがなければ何もしない
      if (!hasText && !hasImages && !hasFiles) {
        logger.warn('sendMessage: No content to send.');
        return null;
      }

      let messageTs: string | null = null;

      // テキスト送信
      if (hasText) {
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: content.text
            }
          }
        ];
        const result = await this.app.client.chat.postMessage({
          channel: channelId,
          text: content.text,
          blocks
        });
        messageTs = result.ts as string;
      }

      // ファイル送信（images, files両方対応）
      const uploadTargets: { file: any, filename: string, initial_comment?: string }[] = [];

      if (hasImages) {
        for (const image of content.images!) {
          uploadTargets.push({
            file: image,
            filename: 'image.png',
            initial_comment: hasText ? undefined : 'Image from ERIAS'
          });
        }
      }
      if (hasFiles) {
        for (const file of content.files!) {
          uploadTargets.push({
            file: file.content,
            filename: file.name,
            initial_comment: hasText ? undefined : file.name
          });
        }
      }

      for (const target of uploadTargets) {
        await this.app.client.files.uploadV2({
          channel_id: channelId,
          file: target.file,
          filename: target.filename,
          initial_comment: target.initial_comment,
          thread_ts: messageTs || undefined
        });
      }

      // テキスト送信時はそのts、ファイルのみ送信時はnull
      return messageTs;
    } catch (error) {
      logError(String(error), 'Error sending message to Slack:');
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
          await this.app.client.files.uploadV2({
            channel_id: channelId,
            thread_ts: messageId,
            file: image,
            filename: 'image.png'
          });
        }
      }
      
      if (content.files && content.files.length > 0) {
        for (const file of content.files) {
          await this.app.client.files.uploadV2({
            channel_id: channelId,
            thread_ts: messageId,
            file: file.content,
            filename: file.name
          });
        }
      }
      
      return true;
    } catch (error) {
      logError(String(error), 'Error updating Slack message:');
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
      logError(String(error), 'Error registering Slack commands:');
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
      logError(String(error), 'Error fetching Slack user:');
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
