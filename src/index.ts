/**
 * ERIAS - メイン起動ポイント
 * マルチプラットフォーム対応版
 */
import { PlatformManager } from './platforms/platformManager';
import { CommandHandler } from './bot/commandHandler';
import { FeedbackMessageHandler } from './bot/feedbackMessageHandler';
import { AgentCore } from './agent/agentCore';
import { config, validateConfig } from './config/config';
import { logger } from './tools/logger';
import { PlatformCommandDefinition } from './platforms/types';

async function main() {
  console.log(`
    ███████╗██████╗ ██╗ █████╗ ███████╗
    ██╔════╝██╔══██╗██║██╔══██╗██╔════╝
    █████╗  ██████╔╝██║███████║███████╗
    ██╔══╝  ██╔══██╗██║██╔══██║╚════██║
    ███████╗██║  ██║██║██║  ██║███████║
    ╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚══════╝
    
    Discord + Slack 対応 AI開発エージェント v${config.APP_VERSION}
  `);
  
  // 設定の検証
  const { isValid, errors } = validateConfig();
  if (!isValid) {
    console.error('設定エラー:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  
  try {
    logger.info('ERIASを起動中...');
    
    // エージェントコアの初期化
    const agentCore = new AgentCore();
    
    // コマンドハンドラーとフィードバックハンドラーのセットアップ
    const commandHandler = new CommandHandler(agentCore);
    const feedbackMessageHandler = new FeedbackMessageHandler(agentCore);
    
    // プラットフォームマネージャーの初期化
    const platformManager = PlatformManager.getInstance();
    
    // メッセージとコマンドのハンドラーを登録
    platformManager.addMessageHandler(async (message) => {
      await feedbackMessageHandler.handleMessage(message);
    });
    
    platformManager.addCommandHandler(async (command) => {
      await commandHandler.handleCommand(command);
    });
    
    // プラットフォームアダプターの初期化
    await platformManager.initializeAdapters();
    
    // コマンド定義（プラットフォーム共通）
    const commands: PlatformCommandDefinition[] = [
      {
        name: 'newproject',
        description: '新しいプロジェクトを開始します',
        options: [
          {
            name: 'spec',
            description: 'プロジェクト仕様',
            type: 'string',
            required: true
          }
        ]
      },
      {
        name: 'status',
        description: 'プロジェクトの進捗状況を確認します',
        options: [
          {
            name: 'taskid',
            description: 'タスクID',
            type: 'string',
            required: true
          }
        ]
      },
      {
        name: 'cancel',
        description: '実行中のプロジェクトをキャンセルします',
        options: [
          {
            name: 'taskid',
            description: 'タスクID',
            type: 'string',
            required: true
          }
        ]
      },
      {
        name: 'help',
        description: 'ヘルプを表示します',
        options: []
      },
      {
        name: 'githubrepo',
        description: '既存リポジトリに機能を追加します',
        options: [
          {
            name: 'repo',
            description: 'リポジトリURL',
            type: 'string',
            required: true
          },
          {
            name: 'task',
            description: '実装するタスク',
            type: 'string',
            required: true
          }
        ]
      }
    ];
    
    // すべてのプラットフォームにコマンド登録
    await platformManager.registerCommandsToAllPlatforms(commands);
    
    logger.info('ERIASが正常に起動しました');
    console.log('ERIAS マルチプラットフォーム対応版が起動しました');
    
    // アクティブなプラットフォームの表示
    const adapters = platformManager.getAllAdapters();
    console.log(`アクティブなプラットフォーム: ${adapters.map(a => a.getAdapterType()).join(', ')}`);
    
  } catch (error) {
    logger.error('起動中にエラーが発生しました:', error);
    console.error('起動中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// アプリケーション起動
main().catch(error => {
  logger.error('予期しないエラーが発生しました:', error);
  console.error('予期しないエラーが発生しました:', error);
  process.exit(1);
});

// 終了処理
process.on('SIGINT', () => {
  logger.info('ERIASを終了中...');
  console.log('ERIASを終了中...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('ERIASを終了中...');
  console.log('ERIASを終了中...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('未処理の例外が発生しました:', error);
  console.error('未処理の例外が発生しました:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未処理のPromise拒否が発生しました:', reason);
  console.error('未処理のPromise拒否が発生しました:', reason);
});
