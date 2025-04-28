/**
 * プラットフォーム共通のコマンドハンドラー
 */
import { PlatformCommand } from '../platforms/types';
import { logger } from '../tools/logger';
import { AgentCore } from '../agent/agentCore';

export class CommandHandler {
  private agentCore: AgentCore;
  
  constructor(agentCore: AgentCore) {
    this.agentCore = agentCore;
  }
/**
   * Discord用スラッシュコマンド定義を返す
   */
  getSlashCommands() {
    return [
      {
        name: 'newproject',
        description: '新しいプロジェクトを生成',
        options: [
          {
            name: 'spec',
            type: 3, // STRING
            description: 'プロジェクト仕様',
            required: true,
          },
        ],
      },
      {
        name: 'status',
        description: 'プロジェクト生成の状態を確認',
        options: [
          {
            name: 'taskid',
            type: 3, // STRING
            description: 'タスクID',
            required: true,
          },
        ],
      },
      {
        name: 'cancel',
        description: '実行中のプロジェクト生成をキャンセル',
        options: [
          {
            name: 'taskid',
            type: 3, // STRING
            description: 'タスクID',
            required: true,
          },
        ],
      },
      {
        name: 'help',
        description: 'このヘルプを表示',
        options: [],
      },
      {
        name: 'githubrepo',
        description: 'GitHubリポジトリからプロジェクトを生成',
        options: [
          {
            name: 'repo',
            type: 3, // STRING
            description: 'GitHubリポジトリURL',
            required: true,
          },
          {
            name: 'task',
            type: 3, // STRING
            description: '実行するタスク内容',
            required: true,
          },
        ],
      },
    ];
  }

  /**
   * コマンドを適切なハンドラーに振り分け
   */
  async handleCommand(command: PlatformCommand): Promise<void> {
    logger.info(`Received command: ${command.name} from ${command.user.platformType}`);
    
    try {
      switch (command.name) {
        case 'newproject':
          await this.handleNewProject(command);
          break;
        case 'status':
          await this.handleStatus(command);
          break;
        case 'cancel':
          await this.handleCancel(command);
          break;
        case 'help':
          await this.handleHelp(command);
          break;
        case 'githubrepo':
          await this.handleGithubRepo(command);
          break;
        default:
          await command.respondToCommand({
            text: `コマンド「${command.name}」は認識されませんでした。'/help'を使用して利用可能なコマンドを確認してください。`
          });
      }
    } catch (error) {
      logger.error(`Error handling command ${command.name}:`, error);
      await command.respondToCommand({
        text: `コマンド実行中にエラーが発生しました：${(error as Error).message}`
      });
    }
  }

  /**
   * 新規プロジェクト生成コマンドの処理
   */
  private async handleNewProject(command: PlatformCommand): Promise<void> {
    const spec = command.options['spec'] as string;
    
    if (!spec) {
      await command.respondToCommand({
        text: '`/newproject` コマンドにはプロジェクト仕様を指定する必要があります。例：`/newproject シンプルなToDoリストアプリを作成`'
      });
      return;
    }
    
    await command.respondToCommand({
      text: 'プロジェクト生成リクエストを処理中...'
    });
    
    try {
      const taskId = await this.agentCore.startNewProject(spec, {
        userId: command.user.id,
        platformType: command.user.platformType,
        channelId: command.channelId
      });
      
      await command.respondToCommand({
        text: `プロジェクト作成を開始しました。タスクID：${taskId}\n\n追加の指示やフィードバックは \`task:${taskId} [指示内容]\` の形式で送信できます。`
      });
    } catch (error) {
      logger.error('Failed to start new project:', error);
      await command.respondToCommand({
        text: `プロジェクト作成の開始に失敗しました：${(error as Error).message}`
      });
    }
  }

  /**
   * タスク状態確認コマンドの処理
   */
  private async handleStatus(command: PlatformCommand): Promise<void> {
    const taskId = command.options['taskid'] as string;
    
    if (!taskId) {
      await command.respondToCommand({
        text: '`/status` コマンドには確認するタスクIDを指定する必要があります。例：`/status abc123`'
      });
      return;
    }
    
    try {
      const status = await this.agentCore.getTaskStatus(taskId);
      
      if (!status) {
        await command.respondToCommand({
          text: `タスクID：${taskId} が見つかりませんでした。`
        });
        return;
      }
      
      await command.respondToCommand({
        text: `**タスクID：${taskId}**\n状態：${status.state}\n進捗：${Math.round(status.progress * 100)}%\n開始時間：${status.startTime.toLocaleString()}\n${status.description || ''}`
      });
    } catch (error) {
      logger.error(`Failed to get status for task ${taskId}:`, error);
      await command.respondToCommand({
        text: `タスク状態の取得に失敗しました：${(error as Error).message}`
      });
    }
  }

  /**
   * タスクキャンセルコマンドの処理
   */
  private async handleCancel(command: PlatformCommand): Promise<void> {
    const taskId = command.options['taskid'] as string;
    
    if (!taskId) {
      await command.respondToCommand({
        text: '`/cancel` コマンドにはキャンセルするタスクIDを指定する必要があります。例：`/cancel abc123`'
      });
      return;
    }
    
    try {
      const result = await this.agentCore.cancelTask(taskId, command.user.id);
      
      if (result) {
        await command.respondToCommand({
          text: `タスクID：${taskId} をキャンセルしました。`
        });
      } else {
        await command.respondToCommand({
          text: `タスクID：${taskId} のキャンセルに失敗しました。タスクが存在しないか、既に完了している可能性があります。`
        });
      }
    } catch (error) {
      logger.error(`Failed to cancel task ${taskId}:`, error);
      await command.respondToCommand({
        text: `タスクのキャンセルに失敗しました：${(error as Error).message}`
      });
    }
  }

  /**
   * ヘルプコマンドの処理
   */
  private async handleHelp(command: PlatformCommand): Promise<void> {
    const helpText = `
**ERIASコマンド一覧**

**基本コマンド**
\`/newproject [仕様]\` - 新しいプロジェクトを生成します
\`/status [タスクID]\` - プロジェクトの進捗状況を確認します
\`/cancel [タスクID]\` - 実行中のプロジェクトをキャンセルします
\`/help\` - このヘルプメッセージを表示します

**GitHub連携コマンド**
\`/githubrepo [リポジトリURL] [タスク]\` - 既存リポジトリに機能を追加します

**フィードバック機能**
実行中のプロジェクトに対して追加の指示を提供できます：
\`task:タスクID [指示内容]\`

特殊タグ：
\`#urgent\` または \`#緊急\` - 緊急の指示として処理します
\`#feature\` または \`#機能\` - 新機能の追加として処理します
\`#fix\` または \`#修正\` - バグ修正として処理します
\`#code\` または \`#コード\` - コード修正として処理します
\`file:パス\` - 特定ファイルへの指示として処理します

**画像生成機能**
通常の会話で画像生成をリクエストできます：
「○○の画像を生成して」
「○○のイメージを作って」
"generate image of ..."
"create an image of ..."
`;

    await command.respondToCommand({
      text: helpText
    });
  }

  /**
   * GitHub連携コマンドの処理
   */
  private async handleGithubRepo(command: PlatformCommand): Promise<void> {
    const repoUrl = command.options['repo'] as string;
    const task = command.options['task'] as string;
    
    if (!repoUrl || !task) {
      await command.respondToCommand({
        text: '`/githubrepo` コマンドにはリポジトリURLとタスク内容の両方を指定する必要があります。\n例：`/githubrepo https://github.com/user/repo ログイン機能を追加`'
      });
      return;
    }
    
    await command.respondToCommand({
      text: 'GitHub連携リクエストを処理中...'
    });
    
    try {
      const taskId = await this.agentCore.startGitHubTask(repoUrl, task, {
        userId: command.user.id,
        platformType: command.user.platformType,
        channelId: command.channelId
      });
      
      await command.respondToCommand({
        text: `GitHub連携タスクを開始しました。タスクID：${taskId}\n\n追加の指示やフィードバックは \`task:${taskId} [指示内容]\` の形式で送信できます。`
      });
    } catch (error) {
      logger.error('Failed to start GitHub task:', error);
      await command.respondToCommand({
        text: `GitHub連携タスクの開始に失敗しました：${(error as Error).message}`
      });
    }
  }
}
