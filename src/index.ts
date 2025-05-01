/**
 * ERIAS - メイン起動ポイント
 * マルチプラットフォーム対応版
 */
import { PlatformManager } from './integrations/platforms/platformManager';
import { CommandHandler } from './bot/commandHandler';
import { FeedbackMessageHandler } from './bot/feedbackMessageHandler';
import AgentCore from './agent/agentCore';
import { config, validateConfig } from './config/config';
import logger from './utils/logger';
import { logError } from './utils/logger';
import { PlatformCommandDefinition } from './integrations/platforms/types';

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
    const agentCore = AgentCore; // default exportがインスタンスの場合
    
    // コマンドハンドラーとフィードバックハンドラーのセットアップ
    const commandHandler = new CommandHandler();
    const feedbackMessageHandler = new FeedbackMessageHandler(agentCore as any);
    
    // プラットフォームマネージャーの初期化
    const platformManager = PlatformManager.getInstance();
    
    // メッセージとコマンドのハンドラーを登録
    platformManager.addMessageHandler(async (message: import('./integrations/platforms/types').PlatformMessage) => {
      await feedbackMessageHandler.handleMessage(message);
    });
    
    platformManager.addCommandHandler(async (command: import('./integrations/platforms/types').PlatformCommand) => {
      // CommandHandlerにhandleCommandは存在しないため、コマンド名で分岐
      if (command.name === 'newproject') {
        const newProjectResult = await commandHandler.handleNewProject(
          command.options?.spec || '',
          {
            platformId: command.platformType,
            channelId: command.channelId || '',
            userId: command.user?.id || '',
            messageId: ''
          }
        );
        await command.respondToCommand({ text: newProjectResult.message });
      } else if (command.name === 'status') {
        const statusResult = await commandHandler.handleStatus(
          command.options?.taskid || ''
        );
        await command.respondToCommand({ text: statusResult.message });
      } else if (command.name === 'cancel') {
        const cancelResult = await commandHandler.handleCancel(
          command.options?.taskid || '',
          {
            platformId: command.platformType,
            channelId: command.channelId || '',
            userId: command.user?.id || '',
            messageId: ''
          }
        );
        await command.respondToCommand({ text: cancelResult.message });
      } else if (command.name === 'help') {
        const helpResult = await commandHandler.handleHelp();
        await command.respondToCommand({ text: helpResult.message });
      } else if (command.name === 'githubrepo') {
        const githubResult = await commandHandler.handleGitHubRepo(
          command.options?.repo || '',
          command.options?.task || '',
          {
            platformId: command.platformType,
            channelId: command.channelId || '',
            userId: command.user?.id || '',
            messageId: ''
          }
        );
        await command.respondToCommand({ text: githubResult.message });
      } else if (command.name === 'generatefile') {
        const generateResult = await commandHandler.handleGenerateFile(
          command.options?.repo || '',
          command.options?.path || '',
          command.options?.desc || '',
          {
            platformId: command.platformType,
            channelId: command.channelId || '',
            userId: command.user?.id || '',
            messageId: ''
          }
        );
        await command.respondToCommand({ text: generateResult.message });
      } else if (command.name === 'reviewpr') {
        const reviewResult = await commandHandler.handleReviewPR(
          command.options?.repo || '',
          parseInt(command.options?.pr || '0'),
          {
            platformId: command.platformType,
            channelId: command.channelId || '',
            userId: command.user?.id || '',
            messageId: ''
          }
        );
        await command.respondToCommand({ text: reviewResult.message });
      }
      // 必要に応じて他のコマンドも追加
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
      },
      {
        name: 'generatefile',
        description: '特定のファイルを生成します',
        options: [
          {
            name: 'repo',
            description: 'リポジトリURL',
            type: 'string',
            required: true
          },
          {
            name: 'path',
            description: 'ファイルパス',
            type: 'string',
            required: true
          },
          {
            name: 'desc',
            description: 'ファイルの説明',
            type: 'string',
            required: true
          }
        ]
      },
      {
        name: 'reviewpr',
        description: 'PRをレビューします',
        options: [
          {
            name: 'repo',
            description: 'リポジトリURL',
            type: 'string',
            required: true
          },
          {
            name: 'pr',
            description: 'PR番号',
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
    if (typeof error === 'object' && error !== null && 'message' in error) {
      logger.error('起動中にエラーが発生しました:', (error as { message?: string }).message);
      console.error('起動中にエラーが発生しました:', (error as { message?: string }).message);
    } else {
      logger.error('起動中にエラーが発生しました: 不明なエラー');
      console.error('起動中にエラーが発生しました: 不明なエラー');
    }
    process.exit(1);
  }
}

// アプリケーション起動
main().catch(error => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    logger.error('予期しないエラーが発生しました:', (error as { message?: string }).message);
    console.error('予期しないエラーが発生しました:', (error as { message?: string }).message);
  } else {
    logger.error('予期しないエラーが発生しました: 不明なエラー');
    console.error('予期しないエラーが発生しました: 不明なエラー');
  }
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
  if (typeof error === 'object' && error !== null && 'message' in error) {
    logger.error('未処理の例外が発生しました:', (error as { message?: string }).message);
    console.error('未処理の例外が発生しました:', (error as { message?: string }).message);
  } else {
    logger.error('未処理の例外が発生しました: 不明なエラー');
    console.error('未処理の例外が発生しました: 不明なエラー');
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    logger.error('未処理のPromise拒否が発生しました:', (reason as { message?: string }).message);
    console.error('未処理のPromise拒否が発生しました:', (reason as { message?: string }).message);
  } else {
    logger.error('未処理のPromise拒否が発生しました: 不明な理由');
    console.error('未処理のPromise拒否が発生しました: 不明な理由');
  }
});
