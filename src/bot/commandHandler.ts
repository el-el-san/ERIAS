import { Message, ApplicationCommandData, CommandInteraction, ChatInputCommandInteraction } from 'discord.js';
import { AgentCore } from '../agent/agentCore.js';
import logger from '../utils/logger.js';

/**
 * Discordコマンドハンドラ
 * スラッシュコマンドの定義と処理を担当
 */
export class CommandHandler {
  private agentCore: AgentCore;
  
  /**
   * CommandHandlerを初期化
   * @param agentCore AIエージェントコア
   */
  constructor(agentCore: AgentCore) {
    this.agentCore = agentCore;
  }
  
  /**
   * スラッシュコマンド定義を取得
   */
  public getSlashCommands(): ApplicationCommandData[] {
    return [
      {
        name: 'newproject',
        description: '新しいプロジェクトを生成します',
        options: [
          {
            name: 'specification',
            description: 'プロジェクトの仕様（詳細な説明）',
            type: 3, // STRING
            required: true,
          }
        ]
      },
      {
        name: 'githubrepo',
        description: 'GitHubリポジトリに対してタスクを実行します',
        options: [
          {
            name: 'repo_url',
            description: 'GitHubリポジトリのURL',
            type: 3, // STRING
            required: true,
          },
          {
            name: 'task',
            description: '実行するタスクの説明',
            type: 3, // STRING
            required: true,
          }
        ]
      },
      {
        name: 'status',
        description: 'プロジェクト生成の状態を確認します',
        options: [
          {
            name: 'task_id',
            description: 'タスクID',
            type: 3, // STRING
            required: true,
          }
        ]
      },
      {
        name: 'cancel',
        description: '実行中のプロジェクト生成をキャンセルします',
        options: [
          {
            name: 'task_id',
            description: 'タスクID',
            type: 3, // STRING
            required: true,
          }
        ]
      },
      {
        name: 'help',
        description: 'ヘルプを表示します',
      }
    ];
  }
  
  /**
   * スラッシュコマンドを処理
   * @param interaction コマンドインタラクション
   */
  public async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName } = interaction;
    
    try {
      switch (commandName) {
        case 'newproject':
          await this.handleNewProjectSlashCommand(interaction);
          break;
          
        case 'githubrepo':
          await this.handleGitHubRepoSlashCommand(interaction);
          break;
          
        case 'status':
          await this.handleStatusSlashCommand(interaction);
          break;
          
        case 'cancel':
          await this.handleCancelSlashCommand(interaction);
          break;
          
        case 'help':
          await this.handleHelpSlashCommand(interaction);
          break;
          
        default:
          await interaction.reply({ content: '不明なコマンドです。', ephemeral: true });
      }
    } catch (error) {
      logger.error(`Error handling slash command ${commandName}: ${(error as Error).message}`);
      
      // インタラクションがすでに応答済みかどうかをチェック
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ 
          content: `コマンド実行中にエラーが発生しました: ${(error as Error).message}`,
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: `コマンド実行中にエラーが発生しました: ${(error as Error).message}`,
          ephemeral: true 
        });
      }
    }
  }
  
  /**
   * newprojectスラッシュコマンド処理
   * @param interaction コマンドインタラクション
   */
  private async handleNewProjectSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // ディファードレスポンスを送信（処理に時間がかかることを通知）
    await interaction.deferReply();
    
    const spec = interaction.options.getString('specification');
    if (!spec) {
      await interaction.followUp('プロジェクトの仕様を指定してください。');
      return;
    }
    
    // タスクを作成
    const task = this.agentCore.createTask(
      interaction.user.id,
      interaction.guild!.id,
      interaction.channel!.id,
      spec
    );
    
    // タスクIDを通知
    await interaction.followUp(
      `プロジェクト生成を開始しました。\nタスクID: \`${task.id}\`\n\n**仕様**:\n${spec}\n\n_状態: 準備中_`
    );
    
    try {
      // 非同期でプロジェクト生成を実行
      this.agentCore.generateProject(task).catch(async (error) => {
        logger.error(`Project generation failed: ${error.message}`);
        // エラーメッセージを送信
        try {
          await interaction.followUp(`<@${interaction.user.id}> プロジェクト生成に失敗しました。エラー: ${error.message}`);
        } catch (followUpError) {
          logger.error(`Failed to send error followup: ${(followUpError as Error).message}`);
        }
      });
    } catch (error) {
      logger.error(`Failed to start project generation: ${(error as Error).message}`);
      await interaction.followUp(`プロジェクト生成の開始に失敗しました。エラー: ${(error as Error).message}`);
    }
  }
  
  /**
   * statusスラッシュコマンド処理
   * @param interaction コマンドインタラクション
   */
  private async handleStatusSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const taskId = interaction.options.getString('task_id');
    if (!taskId) {
      await interaction.reply({ content: 'タスクIDを指定してください。', ephemeral: true });
      return;
    }
    
    const task = this.agentCore.getTask(taskId);
    if (!task) {
      await interaction.reply({ content: `タスクID \`${taskId}\` は見つかりませんでした。`, ephemeral: true });
      return;
    }
    
    const elapsedTime = Math.floor((Date.now() - task.startTime) / 1000);
    const hours = Math.floor(elapsedTime / 3600);
    const minutes = Math.floor((elapsedTime % 3600) / 60);
    const seconds = elapsedTime % 60;
    
    let statusEmoji = '🔄';
    switch (task.status) {
      case 'pending': statusEmoji = '🕐'; break;
      case 'planning': statusEmoji = '📖'; break;
      case 'coding': statusEmoji = '💻'; break;
      case 'testing': statusEmoji = '⚙️'; break;
      case 'debugging': statusEmoji = '🔧'; break;
      case 'completed': statusEmoji = '✅'; break;
      case 'failed': statusEmoji = '❌'; break;
      case 'cancelled': statusEmoji = '⛔'; break;
    }
    
    const statusText = `
**プロジェクト: \`${taskId}\`**

状態: ${statusEmoji} ${task.status}
開始時間: <t:${Math.floor(task.startTime / 1000)}:R>
経過時間: ${hours > 0 ? `${hours}時間` : ''}${minutes > 0 ? `${minutes}分` : ''}${seconds}秒
現在の処理: ${task.currentAction || '不明'}
`;
    
    await interaction.reply(statusText);
  }
  
  /**
   * cancelスラッシュコマンド処理
   * @param interaction コマンドインタラクション
   */
  private async handleCancelSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const taskId = interaction.options.getString('task_id');
    if (!taskId) {
      await interaction.reply({ content: 'キャンセルするタスクIDを指定してください。', ephemeral: true });
      return;
    }
    
    const result = await this.agentCore.cancelTask(taskId);
    if (result) {
      await interaction.reply(`タスク \`${taskId}\` をキャンセルしました。`);
    } else {
      await interaction.reply({ content: `タスク \`${taskId}\` は見つからないか、すでに完了しています。`, ephemeral: true });
    }
  }
  
  /**
   * helpスラッシュコマンド処理
   * @param interaction コマンドインタラクション
   */
  /**
   * githubrepoスラッシュコマンド処理
   * @param interaction コマンドインタラクション
   */
  private async handleGitHubRepoSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // ディファードレスポンスを送信（処理に時間がかかることを通知）
    await interaction.deferReply();
    
    const repoUrl = interaction.options.getString('repo_url');
    const task = interaction.options.getString('task');
    
    if (!repoUrl) {
      await interaction.followUp('GitHubリポジトリのURLを指定してください。');
      return;
    }
    
    if (!task) {
      await interaction.followUp('実行するタスクを指定してください。');
      return;
    }
    
    const githubTask = this.agentCore.createGitHubTask(
      interaction.user.id,
      interaction.guild!.id,
      interaction.channel!.id,
      repoUrl,
      task
    );
    
    // タスクIDを通知
    await interaction.followUp(
      `GitHubリポジトリタスクを開始しました。\nタスクID: \`${githubTask.id}\`\n\n**リポジトリ**: ${repoUrl}\n**タスク**: ${task}\n\n_状態: 準備中_`
    );
    
    try {
      this.agentCore.executeGitHubTask(githubTask).then(async (prUrl) => {
        await interaction.followUp(`<@${interaction.user.id}> GitHubタスクが完了しました。\nプルリクエスト: ${prUrl}`);
      }).catch(async (error) => {
        logger.error(`GitHub task execution failed: ${error.message}`);
        // エラーメッセージを送信
        try {
          await interaction.followUp(`<@${interaction.user.id}> GitHubタスクの実行に失敗しました。エラー: ${error.message}`);
        } catch (followUpError) {
          logger.error(`Failed to send error followup: ${(followUpError as Error).message}`);
        }
      });
    } catch (error) {
      logger.error(`Failed to start GitHub task: ${(error as Error).message}`);
      await interaction.followUp(`GitHubタスクの開始に失敗しました。エラー: ${(error as Error).message}`);
    }
  }

  private async handleHelpSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const helpText = `
**Discord AI エージェント - コマンド一覧**

\`/newproject [仕様]\` - 新しいプロジェクトを生成
\`/githubrepo [repo_url] [task]\` - GitHubリポジトリに対してタスクを実行
\`/status [タスクID]\` - プロジェクト生成の状態を確認
\`/cancel [タスクID]\` - 実行中のプロジェクト生成をキャンセル
\`/help\` - このヘルプを表示

**使用例**
\`/newproject Reactを使用したシンプルなTODOアプリを作成してください。LocalStorageでデータを保存し、タスクの追加、編集、削除、完了のマーキングができるようにしてください。\`
\`/githubrepo https://github.com/username/repo ログイン機能にGoogle認証を追加してください。\`
`;
    
    await interaction.reply(helpText);
  }
}
