/**
 * プルリクエスト関連の機能
 */

import { logger } from '../../../tools/logger';
import { GitHubServiceBase } from './GitHubServiceBase';
import { PullRequestResult, ReviewComment } from './types';
import { RepositoryService } from './RepositoryService'; 

export class PullRequestService extends GitHubServiceBase {
  private repositoryService?: RepositoryService;
  /**
   * リポジトリを初期化する
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   * @returns リポジトリパス
   */
  public async initRepository(owner: string, repo: string, repositoryService?: RepositoryService): Promise<string> {
    super.init(owner, repo);
    logger.info(`PullRequestService: リポジトリ初期化 ${owner}/${repo}`);
    // repositoryService が渡されていれば analyzer を共有
    if (repositoryService) {
      this.repositoryService = repositoryService;
      this.repositoryAnalyzer = (repositoryService as any).repositoryAnalyzer;
    }
    return `${owner}/${repo}`;
  }

  /**
   * プルリクエストを作成する
   */
  public async createPullRequest(
    title: string,
    headBranch: string,
    baseBranch: string = 'main',
    body: string = '',
    repoService: any = null
  ): Promise<PullRequestResult> {
    try {
      logger.info(`プルリクエスト作成開始: ${headBranch} -> ${baseBranch}`);
      if (repoService) {
        await repoService.pushChanges(headBranch);
      }
      let prBody = body;
      if (!prBody && repoService && this.repositoryAnalyzer) {
        const changedFiles = await repoService.getChangedFiles(headBranch, baseBranch);
        const analysisResult = await this.repositoryAnalyzer.analyzeRepository();
        prBody = await this.llmIntegration.generatePRDescription(
          title,
          changedFiles,
          analysisResult
        );
      }
      logger.info(`詳細PRを作成: owner=${this.owner}, repo=${this.repo}, head=${headBranch}, base=${baseBranch}`);
      const user = await this.octokit.users.getAuthenticated();
      logger.info(`認証済みユーザー: ${user.data.login}`);
      try {
        await this.octokit.repos.get({ owner: this.owner, repo: this.repo });
      } catch (repoError) {
        logger.error(`リポジトリ確認エラー: ${this.getErrorMessage(repoError)}`);
        throw new Error(`リポジトリ ${this.owner}/${this.repo} が存在しないか、アクセス権限がありません。`);
      }
      const compare = await this.octokit.repos.compareCommits({
        owner: this.owner,
        repo: this.repo,
        base: baseBranch,
        head: headBranch
      });
      if (compare.data.behind_by > 0) {
        logger.warn(`ブランチ比較: ${compare.data.behind_by} behind by files`);
      }
      const pr = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        head: headBranch,
        base: baseBranch,
        title,
        body: prBody
      });
      logger.info(`プルリクエスト作成完了: #${pr.data.number}`);
      return { number: pr.data.number, url: pr.data.html_url };
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`プルリクエスト作成中にエラーが発生: ${errorMsg}`);
      
      // エラーメッセージがブランチ履歴の問題を示している場合
      if (errorMsg.includes('no history in common') || errorMsg.includes('no common ancestor')) {
        logger.error(`ブランチの履歴に問題があります。ベースブランチ(${baseBranch})とヘッドブランチ(${headBranch})に共通の履歴がありません。`);
        logger.info(`この問題は通常、リモートURLが正しくないか、初期コミットがないことが原因です。`);
      }
      
      throw new Error(`プルリクエスト作成に失敗しました: ${errorMsg}`);
    }
  }

  /**
   * プルリクエストにレビューコメントを追加
   */
  public async reviewPullRequest(prNumber: number): Promise<void> {
    try {
      logger.info(`プルリクエストレビュー開始: #${prNumber}`);
      // PR詳細取得
      const pr = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });
      // 変更ファイル一覧取得
      const filesResponse = await this.octokit.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });
      const filesWithContent: { path: string; content: string }[] = [];
      for (const file of filesResponse.data) {
        if (!file.filename) continue;
        // GitHub API からファイル内容を取得
        const resp = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: file.filename,
          ref: pr.data.head.ref
        });
        let content = '';
        if ('content' in resp.data && resp.data.content) {
          content = Buffer.from(resp.data.content, 'base64').toString('utf8');
        }
        filesWithContent.push({ path: file.filename, content });
      }
      // リポジトリ分析
      const analysisResult = await this.repositoryAnalyzer!.analyzeRepository();
      // レビューコメント生成
      const reviewComments = await this.llmIntegration.generatePRReviewComments(
        pr.data.title,
        filesWithContent,
        analysisResult
      );
      if (reviewComments.length > 0) {
        await this.octokit.pulls.createReview({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          commit_id: pr.data.head.sha,
          event: 'COMMENT',
          comments: reviewComments.map(comment => ({ path: comment.filePath, position: comment.line, body: comment.comment }))
        });
        logger.info(`プルリクエストレビュー完了: #${prNumber} (${reviewComments.length} コメント)`);
      } else {
        logger.info(`プルリクエストレビュー完了: #${prNumber} (コメントなし)`);
      }
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`プルリクエストレビュー中にエラーが発生: ${errorMsg}`);
      throw new Error(`プルリクエストレビューに失敗しました: ${errorMsg}`);
    }
  }

  /**
   * プルリクエストをマージする
   */
  public async mergePullRequest(
    prNumber: number,
    method: 'merge' | 'squash' | 'rebase' = 'merge'
  ): Promise<boolean> {
    try {
      logger.info(`プルリクエストマージ開始: #${prNumber} (${method})`);
      const mergeResult = await this.octokit.pulls.merge({ owner: this.owner, repo: this.repo, pull_number: prNumber, merge_method: method });
      logger.info(`プルリクエストマージ完了: #${prNumber}`);
      return mergeResult.data.merged === true;
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`プルリクエストマージ中にエラーが発生: ${errorMsg}`);
      return false;
    }
  }

  /**
   * プルリクエストの状態を取得
   */
  public async getPullRequestStatus(
    prNumber: number
  ): Promise<{ state: string; mergeable: boolean | null; rebaseable: boolean | null; mergeable_state: string }> {
    try {
      const pr = await this.octokit.pulls.get({ owner: this.owner, repo: this.repo, pull_number: prNumber });
      return { state: pr.data.state, mergeable: pr.data.mergeable, rebaseable: pr.data.rebaseable ?? null, mergeable_state: pr.data.mergeable_state };
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`PR状態取得中にエラーが発生: ${errorMsg}`);
      throw new Error(`PR状態取得に失敗しました: ${errorMsg}`);
    }
  }
}