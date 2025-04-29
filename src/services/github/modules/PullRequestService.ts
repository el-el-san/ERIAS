/**
 * プルリクエスト関連の機能
 */

import { logger } from '../../../tools/logger';
import { GitHubServiceBase } from './GitHubServiceBase';
import { PullRequestResult, ReviewComment } from './types';

export class PullRequestService extends GitHubServiceBase {
  /**
   * リポジトリを初期化する
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   * @returns リポジトリパス
   */
  public async initRepository(owner: string, repo: string): Promise<string> {
    // 親クラスのinitを呼び出す
    super.init(owner, repo);
    logger.info(`PullRequestService: リポジトリ初期化 ${owner}/${repo}`);
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
      
      // 変更をプッシュ（repoServiceが提供されている場合）
      if (repoService) {
        await repoService.pushChanges(headBranch);
      }
      
      // PRボディが指定されていない場合は生成
      let prBody = body;
      if (!prBody && repoService && this.repositoryAnalyzer) {
        // 変更されたファイル情報を取得
        const changedFiles = await repoService.getChangedFiles(headBranch, baseBranch);
        
        // リポジトリ分析結果を取得
        const analysisResult = await this.repositoryAnalyzer.analyzeRepository();
        
        // LLMによるPR説明生成
        prBody = await this.llmIntegration.generatePRDescription(
          title,
          changedFiles,
          analysisResult
        );
      } else if (!prBody) {
        // 分析結果がない場合は簡易説明
        prBody = `# ${title}\n\n## 概要\n${title}の実装`;
      }
      
      // プルリクエスト作成
      logger.info(`詳細PRを作成: owner=${this.owner}, repo=${this.repo}, head=${headBranch}, base=${baseBranch}`);
      
      // GitHubのアクセストークンが正しく設定されているか確認
      const user = await this.octokit.users.getAuthenticated();
      logger.info(`認証済みユーザー: ${user.data.login}`);
      
      try {
        // リポジトリが存在するか確認
        await this.octokit.repos.get({
          owner: this.owner,
          repo: this.repo
        });
      } catch (repoError) {
        logger.error(`リポジトリ確認エラー: ${this.getErrorMessage(repoError)}`);
        throw new Error(`リポジトリ ${this.owner}/${this.repo} が存在しないか、アクセス権限がありません。`);
      }
      
      try {
        // PR作成前にフォーク関係などを確認
        const compare = await this.octokit.repos.compareCommits({
          owner: this.owner,
          repo: this.repo,
          base: baseBranch,
          head: headBranch
        });
        
        logger.info(`コミット比較: ${compare.data.status}, ${compare.data.ahead_by} commits ahead, ${compare.data.behind_by} commits behind`);
      } catch (compareError) {
        logger.warn(`コミット比較エラー: ${this.getErrorMessage(compareError)}. ブランチが適切にプッシュされていない可能性があります。`);
      }
      
      // PR作成時には単純なブランチ名を指定
      const pr = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title,
        head: headBranch,
        base: baseBranch,
        body: prBody,
        maintainer_can_modify: true
      });
      
      logger.info(`プルリクエスト作成完了: #${pr.data.number} ${pr.data.html_url}`);
      
      return {
        url: pr.data.html_url,
        number: pr.data.number
      };
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
      
      // プルリクエストの詳細を取得
      const pr = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });
      
      // プルリクエストのファイル一覧を取得
      const filesResponse = await this.octokit.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });
      
      // リポジトリ分析結果を取得
      if (!this.repositoryAnalyzer) {
        throw new Error('リポジトリが初期化されていません。');
      }
      
      const analysisResult = await this.repositoryAnalyzer.analyzeRepository();
      
      // 各ファイルの内容を取得
      const filesWithContent: Array<{ path: string; content: string }> = [];
      
      for (const file of filesResponse.data) {
        try {
          // ファイルの内容を取得
          const contentResponse = await this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: file.filename,
            ref: pr.data.head.ref
          });
          
          // APIが返すデータ形式によってデコード方法が異なる
          if ('content' in contentResponse.data && contentResponse.data.content) {
            const content = Buffer.from(contentResponse.data.content, 'base64').toString('utf-8');
            
            filesWithContent.push({
              path: file.filename,
              content
            });
          }
        } catch (error: unknown) {
          const errorMsg = this.getErrorMessage(error);
          logger.warn(`ファイル内容取得エラー (${file.filename}): ${errorMsg}`);
        }
      }
      
      // レビューコメントを生成
      const reviewComments = await this.llmIntegration.generatePRReviewComments(
        pr.data.title,
        filesWithContent,
        analysisResult
      );
      
      // レビューコメントがある場合のみレビューを作成
      if (reviewComments.length > 0) {
        // レビューをコメント状態で作成
        await this.octokit.pulls.createReview({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          commit_id: pr.data.head.sha,
          event: 'COMMENT',
          comments: reviewComments.map(comment => ({
            path: comment.filePath,
            position: comment.line,
            body: comment.comment
          }))
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
      
      // プルリクエストをマージ
      const mergeResult = await this.octokit.pulls.merge({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        merge_method: method
      });
      
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
  public async getPullRequestStatus(prNumber: number): Promise<{
    state: string;
    mergeable: boolean | null;
    rebaseable: boolean | null;
    mergeable_state: string;
  }> {
    try {
      const pr = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });
      
      return {
        state: pr.data.state,
        mergeable: pr.data.mergeable,
        rebaseable: pr.data.rebaseable ?? null,
        mergeable_state: pr.data.mergeable_state
      };
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`PR状態取得中にエラーが発生: ${errorMsg}`);
      throw new Error(`PR状態取得に失敗しました: ${errorMsg}`);
    }
  }
}