/**
 * プラットフォーム共通インターフェース定義
 * ERIASがDiscordとSlackの両方に対応するための抽象化レイヤー
 */

export interface MessageContent {
  text?: string;
  images?: Buffer[];
  files?: { name: string; content: Buffer }[];
  embeds?: any[]; // プラットフォーム固有の機能をサポートするための汎用フィールド
}

export interface PlatformUser {
  id: string;
  name: string;
  platformId: string;
  platformType: PlatformType;
}

export enum PlatformType {
  DISCORD = 'discord',
  SLACK = 'slack',
}

export interface PlatformMessage {
  id: string;
  content: string;
  author: PlatformUser;
  channelId: string;
  timestamp: Date;
  attachments?: any[];
  platformType: PlatformType;
  rawMessage?: any; // プラットフォーム固有のメッセージオブジェクト（必要に応じて使用）
}

export interface PlatformCommand {
  name: string;
  options: Record<string, any>;
  user: PlatformUser;
  channelId: string;
  respondToCommand: (content: MessageContent) => Promise<void>;
  platformType: PlatformType;
  rawCommand?: any; // プラットフォーム固有のコマンドオブジェクト
}

export interface PlatformAdapter {
  initialize(): Promise<void>;
  sendMessage(channelId: string, content: MessageContent): Promise<string | null>; // 送信メッセージのIDを返す
  updateMessage(channelId: string, messageId: string, content: MessageContent): Promise<boolean>;
  registerCommands(commands: PlatformCommandDefinition[]): Promise<void>;
  getUser(userId: string): Promise<PlatformUser | null>;
  getAdapterType(): PlatformType;
  onMessageCreate(callback: (message: PlatformMessage) => Promise<void>): void;
  onCommandReceived(callback: (command: PlatformCommand) => Promise<void>): void;
}

export interface PlatformCommandDefinition {
  name: string;
  description: string;
  options?: PlatformCommandOption[];
}

export interface PlatformCommandOption {
  name: string;
  description: string;
  type: string;
  required: boolean;
  choices?: { name: string; value: string }[];
}

// 通知ターゲット情報
export interface NotificationTarget {
  userId: string;
  platformType: PlatformType;
  channelId: string;
}
