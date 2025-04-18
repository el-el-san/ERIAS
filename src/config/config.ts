import dotenv from 'dotenv';
import path from 'path';

// .envファイルを読み込む
dotenv.config();

// 会話履歴の型定義
interface ConversationConfig {
  maxMessagesPerSession: number;
  sessionExpiryTimeMs: number;
  persistSessions: boolean;
  sessionsDir: string;
}

// 環境変数から設定を読み込み、デフォルト値を設定
const config = {
  version: '0.1.0',
  
  // Discord設定
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    allowedGuildIds: (process.env.ALLOWED_GUILD_IDS || '').split(',').filter(Boolean),
    allowedUserIds: (process.env.ALLOWED_USER_IDS || '').split(',').filter(Boolean),
  },
  
  // LLM API設定
  llm: {
    // Google Gemini API
    google: {
      apiKey: process.env.GOOGLE_API_KEY || '',
      defaultModel: process.env.DEFAULT_MODEL || 'gemini-1.5-pro-latest',
    },
    // OpenAI API (オプション)
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      defaultModel: 'gpt-4-turbo',
    },
    // Anthropic API (オプション)
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      defaultModel: 'claude-3-opus-20240229',
    },
  },
  
  // エージェント設定
  agent: {
    // 最大実行時間 (ミリ秒)
    maxExecutionTime: parseInt(process.env.MAX_EXECUTION_TIME || '3600000'),
    // デバッグリトライ回数
    maxDebugRetries: parseInt(process.env.MAX_DEBUG_RETRIES || '5'),
    // 作業ディレクトリパス
    projectsDir: process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects'),
  },
  
  // ログ設定
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: path.join(process.cwd(), 'logs'),
  },
  
  // 会話履歴設定
  conversation: {
    // セッションごとの最大メッセージ数
    maxMessagesPerSession: parseInt(process.env.MAX_MESSAGES_PER_SESSION || '10'),
    // セッション有効期限 (ミリ秒) - デフォルト3時間
    sessionExpiryTimeMs: parseInt(process.env.SESSION_EXPIRY_TIME_MS || '10800000'),
    // セッションを永続化するかどうか
    persistSessions: process.env.PERSIST_SESSIONS === 'true',
    // セッション保存ディレクトリ
    sessionsDir: process.env.SESSIONS_DIR || path.join(process.cwd(), 'conversation_history'),
  } as ConversationConfig,
};

// 設定の検証
if (!config.discord.token) {
  console.error('ERROR: DISCORD_TOKEN is not set in .env file');
  process.exit(1);
}

if (!config.llm.google.apiKey) {
  console.error('ERROR: GOOGLE_API_KEY is not set in .env file');
  process.exit(1);
}

export default config;
