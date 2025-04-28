import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { config } from '../config/config.js';

// ログディレクトリを作成
const logDir = config.LOG_DIR;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ログフォーマット
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(info => {
    return `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}${info.stack ? '\n' + info.stack : ''}`;
  })
);

// ロガーを設定
const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  transports: [
    // コンソール出力
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // ファイル出力（通常ログ）
    new winston.transports.File({ 
      filename: path.join(logDir, 'app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // ファイル出力（エラーログ）
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ]
});

export default logger;
