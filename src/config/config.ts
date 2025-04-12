import dotenv from 'dotenv';
import path from 'path';

// 環境変数を読み込む
dotenv.config();

/**
 * Discord Bot 関連の設定
 */
interface DiscordConfig {
  token: string;
  clientId: string;
  allowedGuildIds: string[];
  allowedUserIds: string[];
}

/**
 * LLM API 関連の設定
 */
interface LLMConfig {
  googleApiKey: string;
  defaultModel: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
}

/**
 * エージェント動作関連の設定
 */
interface AgentConfig {
  maxExecutionTime: number;
  maxDebugRetries: number;
  projectsDir: string;
}

/**
 * ログ関連の設定
 */
interface LoggingConfig {
  level: string;
}

/**
 * アプリ全体の設定
 */
export interface Config {
  discord: DiscordConfig;
  llm: LLMConfig;
  agent: AgentConfig;
  logging: LoggingConfig;
}

/**
 * 環境変数から値を取得し、存在しない場合はデフォルト値を使用
 */
const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`環境変数 ${key} が設定されていません`);
  }
  return value;
};

/**
 * カンマ区切りの環境変数を配列に変換
 */
const getEnvArray = (key: string, defaultValue: string[] = []): string[] => {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
};

/**
 * 環境変数から数値を取得
 */
const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
};

/**
 * 設定情報を環境変数から構築して返す
 */
export const config: Config = {
  discord: {
    token: getEnv('DISCORD_TOKEN'),
    clientId: getEnv('DISCORD_CLIENT_ID'),
    allowedGuildIds: getEnvArray('ALLOWED_GUILD_IDS'),
    allowedUserIds: getEnvArray('ALLOWED_USER_IDS'),
  },
  llm: {
    googleApiKey: getEnv('GOOGLE_API_KEY'),
    defaultModel: getEnv('DEFAULT_MODEL', 'gemini-1.5-pro-latest'),
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  },
  agent: {
    maxExecutionTime: getEnvNumber('MAX_EXECUTION_TIME', 3600000), // デフォルト1時間
    maxDebugRetries: getEnvNumber('MAX_DEBUG_RETRIES', 5),
    projectsDir: getEnv('PROJECTS_DIR', path.resolve(process.cwd(), 'projects')),
  },
  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
  },
};

export default config;
