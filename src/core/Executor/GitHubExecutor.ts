/**
 * GitHub連携タスク実行機能
 */
import { NotificationTarget } from '../../types/agentTypes';
import { NotificationService } from '../notificationService';
import { logError } from '../../utils/logger';
import { TaskManager } from '../TaskManager';
import { GitHubService } from '../../integrations/github/GitHubService';
import { ProjectTask, ProjectStatus, UserFeedback } from '../../types/agentTypes';
import { v4 as uuidv4 } from 'uuid';
import { Coder } from '../../modules/coder';
import Tester from '../../modules/tester';
import { normalizeAbsolutePath } from '../../tools/fileSystem';

export class GitHubExecutor {
  private notificationService: NotificationService;
  private taskManager: TaskManager;
  private githubService: GitHubService;
  private coder: Coder;
  private tester: Tester;

  constructor(taskManager: TaskManager, coder: Coder, tester: Tester) {
    this.notificationService = NotificationService.getInstance();
    this.taskManager = taskManager;
    this.githubService = new GitHubService();
    this.coder = coder;
    this.tester = tester;
  }

  /**
   * GitHub連携タスクの実行
   */
  async executeGitHubTask(taskId: string, repoUrl: string, taskDescription: string, target: NotificationTarget): Promise<void> {
    try {
      // タスクオブジェクトの作成
      const task: ProjectTask = {
        id: taskId,
        status: ProjectStatus.IN_PROGRESS,
        type: 'github',
        createdAt: new Date(),
        updatedAt: new Date(),
        repoUrl: repoUrl,
        repoTask: taskDescription,
        projectPath: `./projects/github-${taskId}`,
        progress: {
          planning: 0,
          coding: 0,
          testing: 0,
          debugging: 0,
          overall: 0
        }
      };

      // 1. リポジトリ分析フェーズ
      await this.taskManager.updateTaskProgress(taskId, 'planning', 0.2, target, 'リポジトリをクローン中...');
      
      const { owner, repo } = this.githubService.parseRepoUrl(repoUrl);
      task.repoOwner = owner;
      task.repoName = repo;
      
      // リポジトリのクローン
      // projectPathが未定義の場合はエラーを回避するための判定を追加
      if (!task.projectPath) {
        throw new Error('プロジェクトパスが未定義です');
      }
      
      const clonePath = normalizeAbsolutePath(task.projectPath);
      const cloneResult = await this.githubService.cloneRepository(repoUrl, clonePath);
      
      if (!cloneResult) {
        throw new Error('リポジトリのクローンに失敗しました');
      }
      
      await this.taskManager.updateTaskProgress(taskId, 'planning', 0.5, target, 'リポジトリ構造を分析中...');
      
      // デフォルトブランチの取得と同期
      const defaultBranch = await this.githubService.getDefaultBranch(owner, repo);
      await this.githubService.syncBranch(clonePath, defaultBranch);
      
      // 新しいブランチの作成
      const timestamp = Math.floor(Date.now() / 1000);
      const branchName = `erias/${timestamp}-task`;
      task.repoBranch = branchName;
      
      await this.taskManager.updateTaskProgress(taskId, 'planning', 0.7, target, `新しいブランチを作成中: ${branchName}`);
      const branchResult = await this.githubService.createBranch(clonePath, branchName);
      
      if (!branchResult) {
        throw new Error('ブランチの作成に失敗しました');
      }
      
      // リポジトリの構造を取得
      const repoFiles = await this.listRepositoryFiles(clonePath);
      
      // 2. 実装フェーズ
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.2, target, `タスクを実行中: ${taskDescription}`);
      
      // GitHubプロンプトの生成
      const githubPrompt = this.githubService.generateGitHubPrompt(taskDescription, repoFiles);
      task.additionalInstructions = githubPrompt;
      
      // フィードバックオブジェクトの作成
      const feedback: UserFeedback = {
        id: uuidv4(),
        taskId: task.id,
        timestamp: Date.now(),
        content: task.repoTask || "", // contentプロパティにnullまたはundefinedを渡さないようにする
        priority: 'high' as const,
        urgency: 'normal' as const,
        type: 'feature' as const,
        status: 'pending' as const
      };
      
      // コーダーを使用して機能を実装
      await this.coder.addFeatureFromFeedback(task, feedback);
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.6, target, '機能の実装が完了しました');
      
      // 3. テストフェーズ
      await this.taskManager.updateTaskProgress(taskId, 'testing', 0.3, target, 'テストを実行中...');
      const testResult = await this.tester.runTests(task);
      
      if (!testResult.success) {
        await this.notificationService.sendNotification(target, {
          text: `⚠️ テストに一部失敗しました。テスト出力: ${testResult.output}`
        });
      } else {
        await this.taskManager.updateTaskProgress(taskId, 'testing', 0.8, target, 'テストに成功しました');
      }
      
      // 4. コミットと変更のプッシュ
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.8, target, '変更をコミット中...');
      const commitMessage = `feat: ${taskDescription.substring(0, 50)}${taskDescription.length > 50 ? '...' : ''}`;
      const commitResult = await this.githubService.commitChanges(clonePath, commitMessage);
      
      if (!commitResult) {
        throw new Error('変更のコミットに失敗しました');
      }
      
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.9, target, '変更をプッシュ中...');
      const pushResult = await this.githubService.pushChanges(clonePath, branchName);
      
      if (!pushResult) {
        throw new Error('変更のプッシュに失敗しました');
      }
      
      // 5. プルリクエスト作成
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.95, target, 'プルリクエストを準備中...');
      
      const prTitle = `feat: ${taskDescription.substring(0, 50)}${taskDescription.length > 50 ? '...' : ''}`;
      const prBody = `
# 機能実装: ${taskDescription}

このプルリクエストは、ERIASのAIエージェントによって自動生成されました。

## 変更内容
${taskDescription}

## テスト結果
${testResult.success ? '✅ すべてのテストに合格しました' : '⚠️ 一部のテストに失敗しました'}
      `;
      
      try {
        const prUrl = await this.githubService.createPullRequest(
          owner,
          repo,
          prTitle,
          prBody,
          branchName,
          defaultBranch
        );
        
        task.pullRequestUrl = prUrl;
        await this.notificationService.sendNotification(target, {
          text: `✅ プルリクエストを作成しました: ${prUrl}`
        });
      } catch (error) {
        throw new Error(`プルリクエストの作成に失敗しました: ${(error as Error).message}`);
      }
      
      // タスク完了
      this.taskManager.setTaskCompleted(taskId, 'GitHub連携タスクが完了しました');
      
      await this.notificationService.sendNotification(target, {
        text: `🎉 GitHub連携タスク ${taskId} が完了しました！\nプルリクエストが作成されました: ${task.pullRequestUrl}`
      });
    } catch (error) {
      logError(error, `Error in GitHub task execution ${taskId}:`);
      
      this.taskManager.setTaskFailed(taskId, error as Error);
      
      await this.notificationService.sendNotification(target, {
        text: `❌ GitHub連携タスク ${taskId} の実行中にエラーが発生しました: ${(error as Error).message}`
      });
    }
  }

  /**
   * リポジトリのファイル一覧を取得
   * @param repoPath リポジトリのパス
   */
  private async listRepositoryFiles(repoPath: string): Promise<string[]> {
    try {
      return await this.githubService.listRepositoryFiles(repoPath);
    } catch (error) {
      logError(`リポジトリのファイル一覧取得に失敗: ${(error as Error).message}`);
      return [];
    }
  }
}
