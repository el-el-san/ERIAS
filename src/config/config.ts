/**
 * アプリケーション設定
 * 環境変数から設定を読み込み
 */
import dotenv from 'dotenv';
import path from 'path';

// .envファイルを読み込み

// Resolve project root directory once to avoid nested paths
const BASE_DIR = path.resolve(__dirname, '../../');
dotenv.config();

export const config = {
  // 一般設定
  APP_NAME: 'ERIAS',
  APP_VERSION: process.env.npm_package_version || '1.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Discord設定
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
  ALLOWED_GUILD_IDS: process.env.ALLOWED_GUILD_IDS || '',
  ALLOWED_USER_IDS: process.env.ALLOWED_USER_IDS || '',
  
  // Slack設定
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || '',
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || '',
  SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN || '',
  SLACK_PORT: parseInt(process.env.SLACK_PORT || '3000', 10),
  SLACK_ALLOWED_CHANNEL_IDS: process.env.SLACK_ALLOWED_CHANNEL_IDS || '',
  
  // プラットフォーム有効化設定
  ENABLE_DISCORD: process.env.ENABLE_DISCORD || 'true',
  ENABLE_SLACK: process.env.ENABLE_SLACK || 'false',
  
  // GitHub設定
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  
  // Google Gemini API設定
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  DEFAULT_MODEL: process.env.DEFAULT_MODEL || 'gemini-2.5-flash-preview-04-17',
  
  // タスク実行設定
  MAX_EXECUTION_TIME: parseInt(process.env.MAX_EXECUTION_TIME || '3600000', 10), // デフォルト1時間
  MAX_DEBUG_RETRIES: parseInt(process.env.MAX_DEBUG_RETRIES || '5', 10),
  PROJECTS_DIR: process.env.PROJECTS_DIR || path.join(BASE_DIR, 'projects'),
  
  // ログ設定
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'erias.log'),
  // ログディレクトリ
  LOG_DIR: process.env.LOG_DIR || path.dirname(process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'erias.log')),

  // 会話管理設定
  MAX_MESSAGES_PER_SESSION: parseInt(process.env.MAX_MESSAGES_PER_SESSION || '10', 10),
  SESSION_EXPIRY_TIME_MS: parseInt(process.env.SESSION_EXPIRY_TIME_MS || '3600000', 10),
  PERSIST_SESSIONS: process.env.PERSIST_SESSIONS === 'true',
  SESSIONS_DIR: process.env.SESSIONS_DIR || path.join(process.cwd(), 'conversation_history'),
};

// 設定の検証
export function validateConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // 少なくとも1つのプラットフォームが有効化されていることを確認
  if (config.ENABLE_DISCORD !== 'true' && config.ENABLE_SLACK !== 'true') {
    errors.push('少なくとも1つのプラットフォーム（DiscordまたはSlack）を有効化する必要があります');
  }
  
  // Discord有効時の必須設定
  if (config.ENABLE_DISCORD === 'true') {
    if (!config.DISCORD_TOKEN) {
      errors.push('Discord有効時はDISCORD_TOKENが必要です');
    }
    if (!config.DISCORD_CLIENT_ID) {
      errors.push('Discord有効時はDISCORD_CLIENT_IDが必要です');
    }
  }
  
  // Slack有効時の必須設定
  if (config.ENABLE_SLACK === 'true') {
    if (!config.SLACK_BOT_TOKEN) {
      errors.push('Slack有効時はSLACK_BOT_TOKENが必要です');
    }
    if (!config.SLACK_SIGNING_SECRET) {
      errors.push('Slack有効時はSLACK_SIGNING_SECRETが必要です');
    }
    if (!config.SLACK_APP_TOKEN) {
      errors.push('Slack有効時はSLACK_APP_TOKENが必要です');
    }
  }
  
  // Gemini API設定の確認
  if (!config.GOOGLE_API_KEY) {
    errors.push('GOOGLE_API_KEYが必要です');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}