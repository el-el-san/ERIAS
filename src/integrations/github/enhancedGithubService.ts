/**
 * 拡張GitHubサービス
 * GitHub連携機能の強化版
 */

import { GitHubServiceOptions, PullRequestResult, FeatureImplementationResult } from './modules/types';
import { RepositoryService } from './modules/RepositoryService';
import { FileService } from './modules/FileService';
import { PullRequestService } from './modules/PullRequestService';
import { FeatureService } from './modules/FeatureService';

/**
 * 拡張GitHubサービス
 * 各機能を統合したファサードクラス
 */
export class EnhancedGitHubService {
  private repositoryService: RepositoryService;
  private fileService: FileService;
  private pullRequestService: PullRequestService;
  private featureService: FeatureService;

  constructor(options: GitHubServiceOptions = {}) {
    // 各サービスの初期化
    this.repositoryService = new RepositoryService(options);
    this.fileService = new FileService(options);
    this.pullRequestService = new PullRequestService(options);
    this.repositoryService = new RepositoryService(options);
    this.fileService = new FileService(options);
    this.pullRequestService = new PullRequestService(options);
    this.featureService = new FeatureService(this.repositoryService);
  }

  // リポジトリ関連メソッド
  async initRepository(owner: string, repo: string): Promise<string> {
    const repoPath = await this.repositoryService.initRepository(owner, repo);
    
    // 他のサービスにも同じレポジトリ情報を設定
    // FileServiceにRepositoryServiceへの参照を渡す
    await this.fileService.initRepository(owner, repo, this.repositoryService);
    await this.pullRequestService.initRepository(owner, repo, this.repositoryService);
    
    // FeatureServiceの初期化も必要
    await this.featureService.initRepository(owner, repo);
    
    return repoPath;
  }

  async createBranch(branchName: string, fromBranch: string = 'main'): Promise<void> {
    return this.repositoryService.createBranch(branchName, fromBranch);
  }

  async pushChanges(branch: string = ''): Promise<void> {
    return this.repositoryService.pushChanges(branch);
  }

  async getRepositoryLanguages(): Promise<Record<string, number>> {
    return this.repositoryService.getRepositoryLanguages();
  }

  // 追跡リスト関連メソッド
  trackModifiedFile(filePath: string): void {
    this.repositoryService.trackModifiedFile(filePath);
  }

  getModifiedFiles(): string[] {
    return this.repositoryService.getModifiedFiles();
  }

  // 追跡リスト関連メソッド

  // ファイル関連メソッド
  async readFile(filePath: string, branch: string = 'main'): Promise<string> {
    return this.fileService.readFile(filePath, branch);
  }

  async updateFile(filePath: string, content: string, message: string, branch: string): Promise<void> {
    // ファイル更新時に追跡リストに追加
    this.repositoryService.trackModifiedFile(filePath);
    // ファイル更新時に追跡リストに追加
    this.repositoryService.trackModifiedFile(filePath);
    return this.fileService.updateFile(filePath, content, message, branch);
  }

  async createFile(filePath: string, content: string, message: string, branch: string): Promise<void> {
    // ファイル作成時に追跡リストに追加
    this.repositoryService.trackModifiedFile(filePath);
    // ファイル作成時に追跡リストに追加
    this.repositoryService.trackModifiedFile(filePath);
    return this.fileService.createFile(filePath, content, message, branch);
  }

  async deleteFile(filePath: string, message: string, branch: string): Promise<void> {
    return this.fileService.deleteFile(filePath, message, branch);
  }

  // プルリクエスト関連メソッド
  async createPullRequest(
    title: string,
    headBranch: string,
    baseBranch: string = 'main',
    body: string = ''
  ): Promise<PullRequestResult> {
    return this.pullRequestService.createPullRequest(
      title, 
      headBranch, 
      baseBranch, 
      body, 
      this.repositoryService
    );
  }

  async reviewPullRequest(prNumber: number): Promise<void> {
    return this.pullRequestService.reviewPullRequest(prNumber);
  }

  async mergePullRequest(
    prNumber: number,
    method: 'merge' | 'squash' | 'rebase' = 'merge'
  ): Promise<boolean> {
    return this.pullRequestService.mergePullRequest(prNumber, method);
  }

  async getPullRequestStatus(prNumber: number): Promise<{
    state: string;
    mergeable: boolean | null;
    rebaseable: boolean | null;
    mergeable_state: string;
  }> {
    return this.pullRequestService.getPullRequestStatus(prNumber);
  }

  // 機能実装関連メソッド
  async implementFeature(taskDescription: string, branchName: string): Promise<FeatureImplementationResult> {
    return this.featureService.implementFeature(taskDescription, branchName);
  }

  async addFeatureFromFeedback(
    branchName: string,
    feedbackDescription: string
  ): Promise<FeatureImplementationResult> {
    return this.featureService.addFeatureFromFeedback(branchName, feedbackDescription);
  }

  // モジュール間連携が必要な操作
  async commitChanges(files: string[], message: string): Promise<void> {
    // ファイル追跡リストに追加
    files.forEach(file => this.repositoryService.trackModifiedFile(file));
    // ファイル追跡リストに追加
    files.forEach(file => this.repositoryService.trackModifiedFile(file));
    return this.repositoryService.commitChanges(files, message);
  }

  async getChangedFiles(headBranch: string, baseBranch: string): Promise<Array<{ path: string; changes: string }>> {
    return this.repositoryService.getChangedFiles(headBranch, baseBranch);
  }
}