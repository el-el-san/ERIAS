import winston from 'winston';
import path from 'path';
import config from '../config/config';

/**
 * 機密情報をマスクするための関数
 * APIキーやトークンを含む文字列をマスクして返す
 */
const maskSensitiveInfo = (info: any): any => {
  if (typeof info.message !== 'string') {
    return info;
  }
  
  // APIキーとトークンのマスク処理
  const maskedMessage = info.message
    .replace(new RegExp(config.discord.token, 'g'), '[DISCORD_TOKEN]')
    .replace(new RegExp(config.llm.googleApiKey, 'g'), '[GOOGLE_API_KEY]');
  
  // OpenAI APIキーのマスク処理 (存在する場合)
  if (config.llm.openaiApiKey) {
    maskedMessage.replace(new RegExp(config.llm.openaiApiKey, 'g'), '[OPENAI_API_KEY]');
  }
  
  // Anthropic APIキーのマスク処理 (存在する場合)
  if (config.llm.anthropicApiKey) {
    maskedMessage.replace(new RegExp(config.llm.anthropicApiKey, 'g'), '[ANTHROPIC_API_KEY]');
  }
  
  info.message = maskedMessage;
  return info;
};

// ロガーフォーマットの定義
const formats = [
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format(maskSensitiveInfo)(),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
  ),
];

// JSONフォーマットの定義（ファイル出力用）
const jsonFormats = [
  winston.format.timestamp(),
  winston.format(maskSensitiveInfo)(),
  winston.format.json(),
];

// ログディレクトリのパス
const logsDir = path.join(process.cwd(), 'logs');

// ロガーの作成
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(...formats),
  transports: [
    // コンソール出力
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        ...formats
      ),
    }),
    
    // エラーログファイル出力
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(...jsonFormats),
    }),
    
    // すべてのログを記録するファイル出力
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: winston.format.combine(...jsonFormats),
    }),
  ],
});

export default logger;
