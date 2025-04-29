/**
 * リポジトリとブランチ操作に関する機能
 */

import * as fs from 'fs';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { logger } from '../../../tools/logger';
import { config } from '../../../config/config';
import { RepositoryAnalyzer } from '../repositoryAnalyzer';
import { GitHubServiceBase } from './GitHubServiceBase';
import { ChangedFile } from './types';

export class RepositoryService extends GitHubServiceBase {
  /**
   * リポジトリをクローンし、必要な初期化を行う
   */
  public async initRepository(owner: string, repo: string): Promise<string> {
    try {
      this.owner = owner;
      this.repo = repo;
      
      const repoUrl = `https://github.com/${owner}/${repo}.git`;
      let repoPath = path.join(this.workDir, `${owner}_${repo}`);
      
      // すでにクローンされている場合は処理
      if (fs.existsSync(repoPath)) {
        // .git ディレクトリが存在するか確認
        if (fs.existsSync(path.join(repoPath, '.git'))) {
          logger.info(`リポジトリはすでに存在します。最新に更新します: ${repoPath}`);
          
          const repoGit = simpleGit(repoPath);
          await repoGit.fetch(['--all']);
          await repoGit.reset(['--hard', 'origin/main']);
          
          logger.info(`リポジトリを最新に更新しました: ${repoPath}`);
          return repoPath;
        } else {
          // .git ディレクトリがない場合は常に新しいディレクトリを使用
          const timestamp = new Date().getTime();
          repoPath = path.join(this.workDir, `${owner}_${repo}_${timestamp}`);
          logger.info(`既存ディレクトリには.gitがありません。タイムスタンプ付きの新しいパスを使用します: ${repoPath}`);
        }
      }
      
      logger.info(`リポジトリクローン開始: ${repoUrl} -> ${repoPath}`);
      
      // ディレクトリ作成
      fs.mkdirSync(repoPath, { recursive: true });
      
      // リポジトリをクローン
      const cloneOptions = ['--config', 'user.name=ERIAS-Agent', '--config', 'user.email=erias-agent@example.com'];
      await this.git.clone(repoUrl, repoPath, cloneOptions);
      
      // クローン後の初期設定
      const repoGit = simpleGit({
        baseDir: repoPath,
        binary: 'git',
        maxConcurrentProcesses: 1
      });
      
      // ユーザー名とメールアドレスを設定
      await repoGit.addConfig('user.name', 'ERIAS-Agent', false, 'local');
      await repoGit.addConfig('user.email', 'erias-agent@example.com', false, 'local');
      
      // リモートURLを確認
      const remotes = await repoGit.getRemotes(true);
      logger.info(`リモート一覧: ${JSON.stringify(remotes)}`);
      
      logger.info(`リポジトリクローン完了: ${repoPath}`);
      
      // リポジトリ分析器を初期化
      this.repositoryAnalyzer = new RepositoryAnalyzer(repoPath, owner, repo);
      
      return repoPath;
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`リポジトリ初期化中にエラーが発生: ${errorMsg}`);
      throw new Error(`リポジトリ初期化に失敗しました: ${errorMsg}`);
    }
  }

  /**
   * 新しいブランチを作成する
   */
  public async createBranch(branchName: string, fromBranch: string = 'main'): Promise<void> {
    try {
      if (!this.repositoryAnalyzer) {
        throw new Error('リポジトリが初期化されていません。initRepository を先に呼び出してください。');
      }
      
      const repoPath = (this.repositoryAnalyzer as any)['repoPath'];
      
      logger.info(`ブランチ作成開始: ${branchName} (from ${fromBranch}) (パス: ${repoPath})`);
      
      // 特定ディレクトリ内でgit操作を行うラッパー関数を作成
      const gitInDirectory = simpleGit({
        baseDir: repoPath,
        binary: 'git',
        maxConcurrentProcesses: 1
      });
      
      // 現在のブランチを取得
      const currentBranch = await gitInDirectory.branch();
      
      // fromBranchに切り替える
      if (currentBranch.current !== fromBranch) {
        await gitInDirectory.checkout([fromBranch]);
      }
      
      // リモートから最新を取得
      await gitInDirectory.pull(['origin', fromBranch]);
      
      // 既存ブランチの一覧を取得
      const branches = await gitInDirectory.branch();
      const branchExists = branches.all.includes(branchName);
      
      if (branchExists) {
        logger.info(`ブランチ '${branchName}' はすでに存在します。既存ブランチを使用します。`);
        await gitInDirectory.checkout([branchName]);
      } else {
        // 新しいブランチを作成
        await gitInDirectory.checkoutBranch(branchName, fromBranch);
        logger.info(`ブランチ '${branchName}' を作成しました。`);
      }
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`ブランチ作成中にエラーが発生: ${errorMsg}`);
      throw new Error(`ブランチ作成に失敗しました: ${errorMsg}`);
    }
  }

  /**
   * 変更をコミットする (-f オプションで.gitignoreの制限を無視)
   */
  public async commitChanges(files: string[], message: string): Promise<void> {
    try {
      if (!this.repositoryAnalyzer) {
        throw new Error('リポジトリが初期化されていません。');
      }
      
      const repoPath = (this.repositoryAnalyzer as any)['repoPath'];
      
      logger.info(`変更をコミット: ${message} (パス: ${repoPath})`);
      
      // 特定ディレクトリ内でgit操作を行うラッパー関数を作成
      const gitInDirectory = simpleGit({
        baseDir: repoPath,
        binary: 'git',
        maxConcurrentProcesses: 1
      });
      
      // ファイルを追加 (-f オプションで.gitignoreを無視する)
      await gitInDirectory.add(['-f', ...files]);
      
      // コミット
      await gitInDirectory.commit(message);
      
      logger.info(`コミット完了: ${message} (パス: ${repoPath})`);
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`コミット中にエラーが発生: ${errorMsg}`);
      throw new Error(`コミットに失敗しました: ${errorMsg}`);
    }
  }

  /**
   * 現在のブランチの変更をプッシュする
   */
  public async pushChanges(branch: string = ''): Promise<void> {
    try {
      if (!this.repositoryAnalyzer) {
        throw new Error('リポジトリが初期化されていません。');
      }
      
      const repoPath = (this.repositoryAnalyzer as any)['repoPath'];
      const repoGit = simpleGit(repoPath);
      
      // ブランチが指定されていない場合は現在のブランチを使用
      if (!branch) {
        const currentBranch = await repoGit.branch();
        branch = currentBranch.current;
      }
      
      logger.info(`変更をプッシュ: ${branch} (パス: ${repoPath})`);
      
      // ディレクトリ内でgit操作を行うラッパー関数を作成
      const gitInDirectory = simpleGit({
        baseDir: repoPath,
        binary: 'git',
        maxConcurrentProcesses: 1
      });
      
      // リモート情報を確認
      const remotes = await gitInDirectory.getRemotes(true);
      logger.info(`リモート一覧: ${JSON.stringify(remotes)}`);
      
      // 認証情報を確認
      try {
        const githubUrl = `https://${config.GITHUB_TOKEN}@github.com/${this.owner}/${this.repo}.git`;
        await gitInDirectory.addRemote('authenticated', githubUrl);
        
        // 認証付きリモートにプッシュ
        logger.info(`認証付きリモートにプッシュ: authenticated ${branch}`);
        await gitInDirectory.push('authenticated', branch, ['--set-upstream', '--force']);
        
        // 一時的な認証リモートを削除
        await gitInDirectory.removeRemote('authenticated');
      } catch (authError) {
        logger.warn(`認証付きプッシュに失敗しました: ${this.getErrorMessage(authError)}。標準プッシュを試みます。`);
        
        // 通常の方法でプッシュを試みる
        await gitInDirectory.push('origin', branch, ['--set-upstream', '--force']);
      }
      
      logger.info(`プッシュ完了: ${branch} (パス: ${repoPath})`);
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`プッシュ中にエラーが発生: ${errorMsg}`);
      throw new Error(`プッシュに失敗しました: ${errorMsg}`);
    }
  }

  /**
   * ブランチ間の変更されたファイルを取得
   */
  public async getChangedFiles(
    headBranch: string,
    baseBranch: string
  ): Promise<ChangedFile[]> {
    try {
      if (!this.repositoryAnalyzer) {
        throw new Error('リポジトリが初期化されていません。');
      }
      
      const repoPath = (this.repositoryAnalyzer as any)['repoPath'];
      const repoGit = simpleGit(repoPath);
      
      // 差分を取得
      const diff = await repoGit.diff([`${baseBranch}...${headBranch}`, '--name-only']);
      const changedFilePaths = diff.split('\n').filter(line => line.trim() !== '');
      
      const result: ChangedFile[] = [];
      
      for (const filePath of changedFilePaths) {
        try {
          // ファイル差分の詳細を取得
          const fileDiff = await repoGit.diff([`${baseBranch}...${headBranch}`, '--', filePath]);
          
          result.push({
            path: filePath,
            changes: fileDiff
          });
        } catch (error: unknown) {
          const errorMsg = this.getErrorMessage(error);
          logger.warn(`ファイル差分取得エラー (${filePath}): ${errorMsg}`);
        }
      }
      
      return result;
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`変更ファイル取得中にエラーが発生: ${errorMsg}`);
      return [];
    }
  }

  /**
   * リポジトリの言語統計を取得
   */
  public async getRepositoryLanguages(): Promise<Record<string, number>> {
    try {
      const response = await this.octokit.repos.listLanguages({
        owner: this.owner,
        repo: this.repo
      });
      
      return response.data;
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`言語統計取得中にエラーが発生: ${errorMsg}`);
      return {};
    }
  }
}
