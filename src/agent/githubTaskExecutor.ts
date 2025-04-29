import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { ProjectTask, ProjectStatus } from './types.js';
import { GitHubService } from '../services/githubService.js';
import { Coder } from './coder.js';
import { Tester } from './tester.js';
import logger from '../utils/logger.js';
import { getProjectPath, normalizeAbsolutePath } from '../tools/fileSystem.js';
import { executeCommand } from '../tools/commandExecutor.js';

/**
 * GitHubリポジトリタスク実行クラス
 * GitHubリポジトリの操作とタスク実行を担当
 */
export class GitHubTaskExecutor {
  private githubService: GitHubService;
  private coder: Coder;
  private tester: Tester;
  
  /**
   * GitHubTaskExecutorを初期化
   * @param coder コード生成モジュール
   * @param tester テスト実行モジュール
   */
  constructor(coder: Coder, tester: Tester) {
    this.githubService = new GitHubService();
    this.coder = coder;
    this.tester = tester;
  }
  
  /**
   * GitHubリポジトリタスクを実行
   * @param task プロジェクトタスク
   * @param notifyProgressFn 進捗通知関数
   */
  public async executeGitHubTask(
    task: ProjectTask,
    notifyProgressFn: (task: ProjectTask, message: string) => Promise<void>
  ): Promise<boolean> {
    if (!task.repoUrl || !task.repoTask) {
      await notifyProgressFn(task, '❌ リポジトリURLまたはタスク内容が指定されていません');
      return false;
    }
    
    try {
      const { owner, repo } = this.githubService.parseRepoUrl(task.repoUrl);
      task.repoOwner = owner;
      task.repoName = repo;
      
      await notifyProgressFn(task, `🔄 リポジトリをクローン中: ${task.repoUrl}`);
      // システム上の実際のクローン先を指定
      const clonePath = normalizeAbsolutePath(task.projectPath ?? '');
      const cloneResult = await this.githubService.cloneRepository(task.repoUrl, clonePath);
      
      if (!cloneResult) {
        await notifyProgressFn(task, '❌ リポジトリのクローンに失敗しました');
        return false;
      }
      
      const defaultBranch = await this.githubService.getDefaultBranch(owner, repo);
      
      const timestamp = Math.floor(Date.now() / 1000);
      
            // デフォルトブランチをリモートの最新に同期
            await this.githubService.syncBranch(clonePath, defaultBranch);
      const branchName = `erias/${timestamp}-task`;
      task.repoBranch = branchName;
      
      await notifyProgressFn(task, `🔄 新しいブランチを作成中: ${branchName}`);
      const branchResult = await this.githubService.createBranch(clonePath, branchName);
      
      if (!branchResult) {
        await notifyProgressFn(task, '❌ ブランチの作成に失敗しました');
        return false;
      }
      
      await notifyProgressFn(task, '🔄 リポジトリの構造を分析中...');
      const repoFiles = await this.listRepositoryFiles(clonePath);
      
      await notifyProgressFn(task, `🔄 タスクを実行中: ${task.repoTask}`);
      
      const githubPrompt = this.githubService.generateGitHubPrompt(task.repoTask, repoFiles);
      
      task.additionalInstructions = githubPrompt;
      
      const feedback = {
        id: uuidv4(),
        taskId: task.id,
        timestamp: Date.now(),
        content: task.repoTask,
        priority: 'high' as const,
        urgency: 'normal' as const,
        type: 'feature' as const,
        status: 'pending' as const
      };
      
      await this.coder.addFeatureFromFeedback(task, feedback);
      
      await notifyProgressFn(task, '🔄 テストを実行中...');
      const testResult = await this.tester.runTests(task);
      
      if (!testResult.success) {
        await notifyProgressFn(task, `⚠️ テストに一部失敗しました。テスト出力: ${testResult.output}`);
      } else {
        await notifyProgressFn(task, '✅ テストに成功しました');
      }
      
      await notifyProgressFn(task, '🔄 変更をコミット中...');
      const commitMessage = `feat: ${task.repoTask.substring(0, 50)}${task.repoTask.length > 50 ? '...' : ''}`;
      const commitResult = await this.githubService.commitChanges(clonePath, commitMessage);
      
      if (!commitResult) {
        await notifyProgressFn(task, '❌ 変更のコミットに失敗しました');
        return false;
      }
      
      await notifyProgressFn(task, '🔄 変更をプッシュ中...');
      const pushResult = await this.githubService.pushChanges(clonePath, branchName);
      
      if (!pushResult) {
        await notifyProgressFn(task, '❌ 変更のプッシュに失敗しました');
        return false;
      }
      
      await notifyProgressFn(task, '🔄 プルリクエストを作成中...');
      
      const prTitle = `feat: ${task.repoTask.substring(0, 50)}${task.repoTask.length > 50 ? '...' : ''}`;
      const prBody = `
      # 機能実装: ${task.repoTask}
      
      このプルリクエストは、ERIASのDiscord AIエージェントによって自動生成されました。
      
      ## 変更内容
      ${task.repoTask}
      
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
        await notifyProgressFn(task, `✅ プルリクエストを作成しました: ${prUrl}`);
      } catch (error) {
        await notifyProgressFn(task, `❌ プルリクエストの作成に失敗しました: ${(error as Error).message}`);
        return false;
      }
      
      task.status = ProjectStatus.COMPLETED;
      return true;
    } catch (error) {
      await notifyProgressFn(task, `❌ エラーが発生しました: ${(error as Error).message}`);
      task.status = ProjectStatus.FAILED;
      return false;
    }
  }
  
  /**
   * リポジトリのファイル一覧を取得
   * @param repoPath リポジトリのパス
   */
  private async listRepositoryFiles(repoPath: string): Promise<string[]> {
    try {
      const { stdout } = await executeCommand(
        'find . -type f -not -path "*/\\.*" -not -path "*/node_modules/*" | sort',
        {},
        repoPath
      );
      
      return stdout.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.replace('./', ''));
    } catch (error) {
      logger.error(`リポジトリのファイル一覧取得に失敗: ${(error as Error).message}`);
      return [];
    }
  }
}
