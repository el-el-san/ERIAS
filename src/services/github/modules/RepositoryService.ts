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
  // 追加：生成・修正したファイルのみを追跡するためのセット
  private modifiedFiles: Set<string> = new Set();

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
          
          // リモートURLが正しいか確認し、必要なら更新
          const remotes = await repoGit.getRemotes(true);
          const originRemote = remotes.find(r => r.name === 'origin');
          
          if (!originRemote || originRemote.refs.fetch !== repoUrl) {
            logger.info(`リモートURLを更新します: ${repoUrl}`);
            // 既存のoriginを削除して正しいURLで再設定
            if (originRemote) {
              await repoGit.removeRemote('origin');
            }
            await repoGit.addRemote('origin', repoUrl);
          }
          
          await repoGit.fetch(['--all']);
          
          // リモートリポジトリの状態を確認
          try {
            // リモートのmainブランチがあるか確認
            const branches = await repoGit.branch(['-r']);
            if (branches.all.includes('origin/main') || branches.all.includes('origin/master')) {
              // 既存のブランチがある場合は、そのブランチから作業を始める
              const defaultBranch = branches.all.includes('origin/main') ? 'main' : 'master';
              await repoGit.checkout([defaultBranch]);
              await repoGit.reset(['--hard', `origin/${defaultBranch}`]);
              logger.info(`リポジトリを${defaultBranch}ブランチの最新状態に更新しました: ${repoPath}`);
            } else {
              // リモートにブランチがない場合（空リポジトリの場合）
              logger.info(`リモートリポジトリに既存のブランチが見つかりません。新しいリポジトリとして初期化します。`);
              // 初期状態としてREADMEを作成
              const readmePath = path.join(repoPath, 'README.md');
              fs.writeFileSync(readmePath, `# ${repo}\n\nInitial repository setup\n`);
              await repoGit.add(['README.md']);
              await repoGit.commit('Initial commit');
              // mainブランチを作成
              await repoGit.checkoutLocalBranch('main');
            }
          } catch (branchError) {
            logger.warn(`ブランチ情報取得エラー: ${this.getErrorMessage(branchError)}, 新しいリポジトリとして初期化します。`);
            // 初期状態としてREADMEを作成
            const readmePath = path.join(repoPath, 'README.md');
            fs.writeFileSync(readmePath, `# ${repo}\n\nInitial repository setup\n`);
            await repoGit.add(['README.md']);
            await repoGit.commit('Initial commit');
            // mainブランチを作成
            await repoGit.checkoutLocalBranch('main');
          }
          
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
      
      try {
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
        
        // リモートURLを確認と修正
        const remotes = await repoGit.getRemotes(true);
        logger.info(`リモート一覧: ${JSON.stringify(remotes)}`);
        
        // リモートURLが正しいか確認し、必要なら更新
        const originRemote = remotes.find(r => r.name === 'origin');
        if (!originRemote || originRemote.refs.fetch !== repoUrl) {
          logger.info(`リモートURLが正しくないため更新します: ${repoUrl}`);
          // 既存のoriginを削除して正しいURLで再設定
          if (originRemote) {
            await repoGit.removeRemote('origin');
          }
          await repoGit.addRemote('origin', repoUrl);
          
          // 更新後のリモート情報を再確認
          const updatedRemotes = await repoGit.getRemotes(true);
          logger.info(`更新後のリモート一覧: ${JSON.stringify(updatedRemotes)}`);
        }
        
        // リモートリポジトリの状態を確認
        try {
          // リモートのmainブランチがあるか確認
          const branches = await repoGit.branch(['-r']);
          if (branches.all.includes('origin/main') || branches.all.includes('origin/master')) {
            // 既存のブランチがある場合は、そのブランチから作業を始める
            const defaultBranch = branches.all.includes('origin/main') ? 'main' : 'master';
            await repoGit.checkout([defaultBranch]);
            logger.info(`リポジトリを${defaultBranch}ブランチで初期化しました: ${repoPath}`);
          } else {
            // リモートにブランチがない場合（空リポジトリの場合）
            logger.info(`リモートリポジトリに既存のブランチが見つかりません。新しいリポジトリとして初期化します。`);
            // 初期状態としてREADMEを作成
            const readmePath = path.join(repoPath, 'README.md');
            fs.writeFileSync(readmePath, `# ${repo}\n\nInitial repository setup\n`);
            await repoGit.add(['README.md']);
            await repoGit.commit('Initial commit');
            // mainブランチを作成
            await repoGit.checkoutLocalBranch('main');
          }
        } catch (branchError) {
          logger.warn(`ブランチ情報取得エラー: ${this.getErrorMessage(branchError)}, 新しいリポジトリとして初期化します。`);
          // 初期状態としてREADMEを作成
          const readmePath = path.join(repoPath, 'README.md');
          fs.writeFileSync(readmePath, `# ${repo}\n\nInitial repository setup\n`);
          await repoGit.add(['README.md']);
          await repoGit.commit('Initial commit');
          // mainブランチを作成
          await repoGit.checkoutLocalBranch('main');
        }
        
      } catch (cloneError) {
        // クローンに失敗した場合（リポジトリが空の場合など）
        logger.warn(`クローンに失敗しました: ${this.getErrorMessage(cloneError)}, 新しいリポジトリとして初期化します。`);
        
        // Gitリポジトリを初期化
        const repoGit = simpleGit({
          baseDir: repoPath,
          binary: 'git',
          maxConcurrentProcesses: 1
        });
        
        await repoGit.init();
        await repoGit.addConfig('user.name', 'ERIAS-Agent', false, 'local');
        await repoGit.addConfig('user.email', 'erias-agent@example.com', false, 'local');
        
        // リモートURLを設定
        await repoGit.addRemote('origin', repoUrl);
        
        // 初期状態としてREADMEを作成
        const readmePath = path.join(repoPath, 'README.md');
        fs.writeFileSync(readmePath, `# ${repo}\n\nInitial repository setup\n`);
        await repoGit.add(['README.md']);
        await repoGit.commit('Initial commit');
        
        // mainブランチを作成
        await repoGit.checkoutLocalBranch('main');
      }
      
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
      
      // リモートURLが正しいか確認
      const remotes = await gitInDirectory.getRemotes(true);
      const originRemote = remotes.find(r => r.name === 'origin');
      const expectedUrl = `https://github.com/${this.owner}/${this.repo}.git`;
      
      if (!originRemote || !originRemote.refs.fetch.includes(`${this.owner}/${this.repo}`)) {
        logger.info(`リモートURLが正しくないため更新します: ${expectedUrl}`);
        if (originRemote) {
          await gitInDirectory.removeRemote('origin');
        }
        await gitInDirectory.addRemote('origin', expectedUrl);
      }
      
      // 現在のブランチを取得
      const currentBranch = await gitInDirectory.branch();
      
      // fromBranchに切り替える
      if (currentBranch.current !== fromBranch) {
        try {
          await gitInDirectory.checkout([fromBranch]);
        } catch (checkoutError) {
          // fromBranchが存在しない場合、masterを試す
          logger.warn(`${fromBranch}ブランチへの切り替えに失敗しました。masterブランチを試みます。`);
          try {
            await gitInDirectory.checkout(['master']);
            fromBranch = 'master';
          } catch (masterError) {
            // どちらも失敗した場合は現在のブランチを使用
            logger.warn(`masterブランチへの切り替えにも失敗しました。現在のブランチを使用します: ${currentBranch.current}`);
            fromBranch = currentBranch.current;
          }
        }
      }
      
      // リモートから最新を取得
      try {
        await gitInDirectory.fetch(['origin']);
// ensure working tree is clean before switching branches
await gitInDirectory.clean('f', ['-d']);
await gitInDirectory.reset(['--hard']);

        // リモートブランチが存在する場合のみpull
        try {
          await gitInDirectory.pull(['origin', fromBranch]);
        } catch (pullError) {
          logger.warn(`リモートブランチからのプルに失敗しました: ${this.getErrorMessage(pullError)}`);
          logger.info(`ローカルブランチのみで作業を継続します。`);
        }
      } catch (fetchError) {
        logger.warn(`リモートからのフェッチに失敗しました: ${this.getErrorMessage(fetchError)}`);
      }
      
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
      
      // 修正ファイルセットをクリア（新しいブランチの作成時）
      this.modifiedFiles.clear();
      
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`ブランチ作成中にエラーが発生: ${errorMsg}`);
      throw new Error(`ブランチ作成に失敗しました: ${errorMsg}`);
    }
  }

  /**
   * 変更をコミットする (ファイルを指定して実行)
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
      
      // 修正ファイルセットに追加
      files.forEach(file => this.modifiedFiles.add(file));
      
      // ファイルを追加 (-f オプションで.gitignoreを無視する)
      await gitInDirectory.add(['-f', ...files]);
      
      // コミット
      await gitInDirectory.commit(message);
      
      logger.info(`コミット完了: ${message} (パス: ${repoPath})`);
      logger.info(`修正されたファイル: ${Array.from(this.modifiedFiles).join(', ')}`);
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`コミット中にエラーが発生: ${errorMsg}`);
      throw new Error(`コミットに失敗しました: ${errorMsg}`);
    }
  }

  /**
   * 現在のブランチの変更をプッシュする (修正ファイルのみ)
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
      
      // リモートURLが正しいか確認し、必要なら更新
      const originRemote = remotes.find(r => r.name === 'origin');
      const expectedUrl = `https://github.com/${this.owner}/${this.repo}.git`;
      
      if (!originRemote || !originRemote.refs.fetch.includes(`${this.owner}/${this.repo}`)) {
        logger.info(`リモートURLが正しくないため更新します: ${expectedUrl}`);
        if (originRemote) {
          await gitInDirectory.removeRemote('origin');
        }
        await gitInDirectory.addRemote('origin', expectedUrl);
      }
      
      // 認証情報を確認
      try {
        // 正しいリポジトリURLを使用する
        const githubUrl = `https://${config.GITHUB_TOKEN}@github.com/${this.owner}/${this.repo}.git`;
        
        // 既存の認証リモートがあれば削除
        try {
          await gitInDirectory.removeRemote('authenticated');
        } catch (removeError) {
          // リモートが存在しない場合はエラーを無視
        }
        
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
   * ファイルを修正リストに追加（コミットなし）
   */
  public trackModifiedFile(filePath: string): void {
    this.modifiedFiles.add(filePath);
    logger.info(`ファイルを追跡リストに追加: ${filePath}`);
  }

  /**
   * 現在修正中のファイル一覧を取得
   */
  public getModifiedFiles(): string[] {
    return Array.from(this.modifiedFiles);
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
      
      // 修正ファイルのみを対象にする場合
      if (this.modifiedFiles.size > 0) {
        logger.info(`修正ファイルのみの差分を返します: ${Array.from(this.modifiedFiles).join(', ')}`);
        
        const result: ChangedFile[] = [];
        
        for (const filePath of this.modifiedFiles) {
          try {
            // ファイルパスを正規化
            const normalizedPath = path.normalize(filePath);
            
            // ファイル内容を取得
            const fileContent = fs.readFileSync(path.join(repoPath, normalizedPath), 'utf-8');
            
            result.push({
              path: normalizedPath,
              changes: fileContent // 全体を変更内容とする
            });
          } catch (fileError) {
            logger.warn(`ファイル読み込みエラー (${filePath}): ${this.getErrorMessage(fileError)}`);
          }
        }
        
        return result;
      }
      
      // 通常のdiff（リポジトリ全体の差分を対象）
      try {
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
      } catch (diffError) {
        logger.warn(`ブランチ間の差分取得に失敗しました: ${this.getErrorMessage(diffError)}`);
        logger.info(`修正されたファイルのみの情報を使用します`);
        
        // ブランチ間の差分が取得できない場合は修正ファイルの情報のみ返す
        const result: ChangedFile[] = [];
        
        for (const filePath of this.modifiedFiles) {
          try {
            // ファイルパスを正規化
            const normalizedPath = path.normalize(filePath);
            
            // ファイル内容を取得
            const fileContent = fs.readFileSync(path.join(repoPath, normalizedPath), 'utf-8');
            
            result.push({
              path: normalizedPath,
              changes: fileContent // 全体を変更内容とする
            });
          } catch (fileError) {
            logger.warn(`ファイル読み込みエラー (${filePath}): ${this.getErrorMessage(fileError)}`);
          }
        }
        
        return result;
      }
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