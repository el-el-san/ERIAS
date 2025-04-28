/**
 * ロガーユーティリティ
 */
import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config/config';

// ログディレクトリの確認と作成
const logDir = path.dirname(config.LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ロガーの設定
export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'erias' },
  transports: [
    // ファイルへのログ出力
    new winston.transports.File({ 
      filename: config.LOG_FILE,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // エラーログ用の別ファイル
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// 開発環境の場合はコンソールにも出力
if (config.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// ロガーラッパー関数
export default {
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
  // プラットフォーム特有のロギング
  platform: (platformType: string, message: string, meta?: any) => {
    logger.info(`[${platformType}] ${message}`, meta);
  }
};
