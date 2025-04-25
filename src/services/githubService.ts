import { Octokit } from '@octokit/rest';
import { simpleGit, SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger.js';
import { executeCommand } from '../tools/commandExecutor.js';
import config from '../config/config.js';

/**
 * GitHubサービスクラス
 * GitHubリポジトリの操作を担当
 */
export class GitHubService {
  private octokit: Octokit;
  
  /**
   * GitHubServiceを初期化
   * @param token GitHubトークン（オプション）
   */
  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN
    });
  }
  
  /**
   * リポジトリURLからオーナーとリポジトリ名を抽出
   * @param repoUrl リポジトリURL
   */
  public parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
    try {
      const url = new URL(repoUrl);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      
      if (pathParts.length >= 2) {
        return {
          owner: pathParts[0],
          repo: pathParts[1].replace('.git', '')
        };
      }
    } catch (error) {
      const parts = repoUrl.split('/');
      if (parts.length >= 2) {
        return {
          owner: parts[0],
          repo: parts[1].replace('.git', '')
        };
      }
    }
    
    throw new Error('無効なリポジトリURL形式です');
  }
  
  /**
   * リポジトリをクローン
   * @param repoUrl リポジトリURL
   * @param targetPath クローン先のパス
   */
  public async cloneRepository(repoUrl: string, targetPath: string): Promise<boolean> {
    logger.info(`リポジトリをクローン中: ${repoUrl} -> ${targetPath}`);
    
    try {
      try {
        await fs.access(targetPath);
        await fs.rm(targetPath, { recursive: true, force: true });
      } catch (error) {
      }
      
      await fs.mkdir(targetPath, { recursive: true });
      
      const { stderr } = await executeCommand(`git clone ${repoUrl} ${targetPath}`, {}, path.dirname(targetPath));
      
      if (stderr && stderr.includes('fatal:')) {
        logger.error(`リポジトリのクローンに失敗: ${stderr}`);
        return false;
      }
      
      logger.info(`リポジトリのクローンに成功: ${repoUrl}`);
      return true;
    } catch (error) {
      logger.error(`リポジトリのクローンに失敗: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * 新しいブランチを作成
   * @param repoPath リポジトリのパス
   * @param branchName ブランチ名
   */
  public async createBranch(repoPath: string, branchName: string): Promise<boolean> {
    logger.info(`新しいブランチを作成中: ${branchName}`);
    
    try {
      const git: SimpleGit = simpleGit(repoPath);
      
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      logger.debug(`現在のブランチ: ${currentBranch}`);
      
      await git.checkoutLocalBranch(branchName);
      
      logger.info(`ブランチの作成に成功: ${branchName}`);
      return true;
    } catch (error) {
      logger.error(`ブランチの作成に失敗: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * 変更をコミット
   * @param repoPath リポジトリのパス
   * @param message コミットメッセージ
   */
  public async commitChanges(repoPath: string, message: string): Promise<boolean> {
    logger.info(`変更をコミット中: ${message}`);
    
    try {
      const git: SimpleGit = simpleGit(repoPath);
      
      await git.add(['--force', '.']);
      
      const commitResult = await git.commit(message);
      
      logger.info(`コミットに成功: ${commitResult.commit}`);
      return true;
    } catch (error) {
      logger.error(`コミットに失敗: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * 変更をプッシュ
   * @param repoPath リポジトリのパス
   * @param branchName ブランチ名
   */
  public async pushChanges(repoPath: string, branchName: string): Promise<boolean> {
    logger.info(`変更をプッシュ中: ${branchName}`);
    
    try {
      const git: SimpleGit = simpleGit(repoPath);
      
      await git.push('origin', branchName, ['--set-upstream']);
      
      logger.info(`プッシュに成功: ${branchName}`);
      return true;
    } catch (error) {
      logger.error(`プッシュに失敗: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * プルリクエストを作成
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   * @param title タイトル
   * @param body 説明
   * @param head ヘッドブランチ
   * @param base ベースブランチ（通常は'main'または'master'）
   */
  public async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string = 'main'
  ): Promise<string> {
    logger.info(`プルリクエストを作成中: ${title}`);
    
    try {
      const { data } = await this.octokit.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base
      });
      
      logger.info(`プルリクエストの作成に成功: ${data.html_url}`);
      return data.html_url;
    } catch (error) {
      logger.error(`プルリクエストの作成に失敗: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * リポジトリのデフォルトブランチを取得
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   */
  public async getDefaultBranch(owner: string, repo: string): Promise<string> {
    try {
      const { data } = await this.octokit.repos.get({
        owner,
        repo
      });
      
      return data.default_branch;
    } catch (error) {
      logger.error(`デフォルトブランチの取得に失敗: ${(error as Error).message}`);
      return 'main'; // デフォルト値を返す
    }
  }
  
  /**
   * GitHubのプロンプトを生成
   * @param task タスク内容
   * @param repoFiles リポジトリのファイル一覧
   */
  public generateGitHubPrompt(task: string, repoFiles: string[]): string {
    return `
    GitHubリポジトリの機能実装タスク:
    ${task}
    
    リポジトリの構造:
    ${repoFiles.join('\n')}
    
    このタスクを実装するために必要なファイルの変更または新規作成を行ってください。
    変更が必要なファイルについては、ファイルパスと変更後のコードを提供してください。
    新規作成が必要なファイルについては、ファイルパスとコードを提供してください。
    コードはコードブロックで囲んでください。
    テスト手順も提供してください。
    `;
  }
  /**
   * 指定したローカルブランチをリモートの最新の状態に同期
   * @param repoPath リポジトリのパス
   * @param branchName ブランチ名
   */
  public async syncBranch(repoPath: string, branchName: string): Promise<boolean> {
    logger.info(`ブランチを同期中: ${branchName}`);

    try {
      const git: SimpleGit = simpleGit(repoPath);

      // 指定ブランチに切り替え
      await git.checkout(branchName);

      // リモートからプルして最新の状態を取得
      await git.pull('origin', branchName);

      logger.info(`ブランチの同期に成功: ${branchName}`);
      return true;
    } catch (error) {
      logger.error(`ブランチの同期に失敗: ${(error as Error).message}`);
      return false;
    }
  }
}
