/**
 * GitHub連携機能のベースクラス
 */

import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { simpleGit, SimpleGit } from 'simple-git';
import { logger } from '../../../tools/logger';
import { config } from '../../../config/config';
import { RepositoryAnalyzer } from '../repositoryAnalyzer';
import { LLMIntegration } from '../llmIntegration';
import { 
  GitHubServiceOptions, 
  RepositoryContext 
} from './types';

export class GitHubServiceBase {
  protected octokit: Octokit;
  protected git: SimpleGit;
  protected workDir: string;
  protected repositoryAnalyzer?: RepositoryAnalyzer;
  protected llmIntegration: LLMIntegration;
  protected owner: string;
  protected repo: string;

  constructor(options: GitHubServiceOptions = {}) {
    this.octokit = new Octokit({
      auth: options.token || config.GITHUB_TOKEN
    });
    
    this.workDir = options.workDir || path.join(config.PROJECTS_DIR, 'github_repos');
    this.owner = options.owner || '';
    this.repo = options.repo || '';
    
    // ワーキングディレクトリが存在しない場合は作成
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }
    
    this.git = simpleGit({
      baseDir: this.workDir,
      binary: 'git',
      maxConcurrentProcesses: 1
    });
    
    this.llmIntegration = new LLMIntegration();
  }

  /**
   * リポジトリ情報を初期化する
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   */
  protected init(owner: string, repo: string): void {
    this.owner = owner;
    this.repo = repo;
    logger.info(`GitHubServiceBase: リポジトリ情報を設定 ${owner}/${repo}`);
  }

  /**
   * リポジトリのコンテキスト情報を取得
   */
  protected getRepositoryContext(): RepositoryContext | null {
    if (!this.repositoryAnalyzer) {
      return null;
    }
    
    return {
      owner: this.owner,
      repo: this.repo,
      repoPath: (this.repositoryAnalyzer as any)['repoPath'],
      analysisResult: undefined
    };
  }

  /**
   * エラーメッセージを取得
   */
  protected getErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return (error as { message?: string }).message || '不明なエラー';
    }
    return '不明なエラー';
  }
}
