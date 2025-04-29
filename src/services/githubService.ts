// 動的インポートのために型だけ先に宣言
type OctokitType = any;
let OctokitModule: { Octokit: OctokitType };
import { simpleGit, SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger.js';
import { executeCommand } from '../tools/commandExecutor.js';
import { config } from '../config/config.js';
import { normalizeAbsolutePath } from '../tools/fileSystem.js';

/**
 * GitHubサービスクラス
 * GitHubリポジトリの操作を担当
 */
export class GitHubService {
  private octokit: OctokitType;
  private repoMap: Map<string, string> = new Map(); // プロジェクトパス -> リポジトリURLのマッピング
  
  /**
   * GitHubServiceを初期化
   * @param token GitHubトークン（オプション）
   */
  constructor(token?: string) {
    // コンストラクタでは初期化だけ行い、実際のOctokitインスタンス作成は後で行う
    this.octokit = null as any;
    this.token = token || process.env.GITHUB_TOKEN;
  }
  
  // トークンを保存するプロパティ
  private token?: string;

  /**
   * Octokitの初期化
   * @param token GitHubトークン
   */
  private async initOctokit(): Promise<void> {
    try {
      // 既に初期化されていれば処理をスキップ
      if (this.octokit && typeof this.octokit !== 'undefined' && this.octokit !== null) {
        return;
      }
      
      // 動的インポート
      if (!OctokitModule) {
        OctokitModule = await import('octokit');
      }
      
      this.octokit = new OctokitModule.Octokit({
        auth: this.token
      });
      
      logger.info('Octokitの初期化が成功しました');
    } catch (error) {
      logger.error(`Octokitの初期化に失敗しました: ${(error as Error).message}`);
      throw error;
    }
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
          owner: parts[parts.length - 2],
          repo: parts[parts.length - 1].replace('.git', '')
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
      // 既存のディレクトリがあれば削除
      try {
        await fs.access(targetPath);
        await fs.rm(targetPath, { recursive: true, force: true });
      } catch (error) {
        // ディレクトリが存在しない場合は無視
      }
      
      await fs.mkdir(targetPath, { recursive: true });
      
      const { stderr } = await executeCommand(`git clone ${repoUrl} ${targetPath}`, {}, path.dirname(targetPath));
      
      if (stderr && stderr.includes('fatal:')) {
        logger.error(`リポジトリのクローンに失敗: ${stderr}`);
        return false;
      }
      
      // クローン成功時にマッピングを保存
      const normalizedPath = normalizeAbsolutePath(targetPath);
      this.repoMap.set(normalizedPath, repoUrl);
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
      
      // まず変更があるか確認
      const status = await git.status();
      
      if (status.files.length === 0) {
        logger.info('変更がありません。コミットをスキップします。');
        return true; // 変更がなくてもエラーとはみなさない
      }
      
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
      const normalizedPath = normalizeAbsolutePath(repoPath);
      const repoUrl = this.repoMap.get(normalizedPath);
      
      if (!repoUrl) {
        logger.error(`リポジトリURLが見つかりません: ${repoPath}`);
        return false;
      }
      
      // リモートURLが正しく設定されているか確認
      const remotes = await git.getRemotes(true);
      const originRemote = remotes.find(r => r.name === 'origin');
      
      if (!originRemote || originRemote.refs.push !== repoUrl) {
        logger.info(`リモートURLを設定中: ${repoUrl}`);
        await git.remote(['set-url', 'origin', repoUrl]);
      }
      
      // リモートリポジトリにアクセスできるか確認
      try {
        await git.listRemote(['--heads']);
      } catch (error) {
        logger.error(`リモートリポジトリへのアクセスに失敗: ${(error as Error).message}`);
        
        // 認証情報を確認
        if (!process.env.GITHUB_TOKEN) {
          throw new Error('GitHubトークンが設定されていません。GITHUB_TOKEN環境変数を設定してください。');
        }
        
        // トークンを使用したURLを設定
        const { owner, repo } = this.parseRepoUrl(repoUrl);
        const tokenUrl = `https://${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git`;
        await git.remote(['set-url', 'origin', tokenUrl]);
        logger.info('認証付きURLを使用してリモートを設定しました');
      }
      
      // プッシュ実行
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
      // Octokitが初期化されていることを確認
      if (!this.octokit) {
        await this.initOctokit();
      }
      
      // GitHub APIの認証を確認
      if (!this.octokit.auth) {
        throw new Error('GitHubトークンが設定されていません。GITHUB_TOKEN環境変数を設定してください。');
      }
      
      const { data } = await this.octokit.rest.pulls.create({
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
      
      // 詳細なエラー情報の記録
      if (error instanceof Error) {
        logger.error(`エラーの詳細: ${error.stack}`);
        
        // Octokit APIエラーの場合、より詳細な情報を取得
        if ('response' in error && (error as any).response) {
          const response = (error as any).response;
          logger.error(`APIエラー: ${response.status} ${response.statusText}`);
          logger.error(`エラーメッセージ: ${JSON.stringify(response.data, null, 2)}`);
        }
      }
      
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
      // Octokitが初期化されていることを確認
      if (!this.octokit) {
        await this.initOctokit();
      }
      
      const { data } = await this.octokit.rest.repos.get({
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
  
  /**
   * リポジトリのファイル一覧を取得
   * @param repoPath リポジトリのパス
   */
  public async listRepositoryFiles(repoPath: string): Promise<string[]> {
    try {
      // OSによって適切なコマンドを使用
      let findCommand = 'find . -type f -not -path "*/\\.*" -not -path "*/node_modules/*" | sort';
      
      // Windows環境の場合は代替コマンドを使用
      if (process.platform === 'win32') {
        findCommand = 'dir /b /s /a:-D | findstr /v /i "\\.git\\" | findstr /v /i "\\node_modules\\"';
      }
      
      const { stdout } = await executeCommand(findCommand, {}, repoPath);
      
      const files = stdout.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
          // Windowsの場合はフルパスが返されるので、相対パスに変換
          if (process.platform === 'win32') {
            return line.replace(repoPath, '').replace(/^\\/g, '');
          }
          return line.replace('./', '');
        });
      
      return files;
    } catch (error) {
      logger.error(`リポジトリのファイル一覧取得に失敗: ${(error as Error).message}`);
      
      // エラー発生時は空の配列を返す
      return [];
    }
  }
  
  /**
   * リポジトリのファイル内容を取得
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   * @param path ファイルパス
   * @param ref ブランチ名またはコミットSHA（オプション）
   */
  public async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    try {
      // Octokitが初期化されていることを確認
      if (!this.octokit) {
        await this.initOctokit();
      }
      
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref
      });
      
      // ディレクトリの場合はエラー
      if (Array.isArray(data)) {
        throw new Error('指定されたパスはディレクトリです');
      }
      
      // ファイルの場合はコンテンツを取得
      if ('content' in data && 'encoding' in data) {
        if (data.encoding === 'base64') {
          return Buffer.from(data.content, 'base64').toString('utf-8');
        }
      }
      
      throw new Error('ファイルのコンテンツを取得できませんでした');
    } catch (error) {
      logger.error(`ファイル内容の取得に失敗: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * リポジトリの詳細情報を取得
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   */
  public async getRepositoryInfo(owner: string, repo: string): Promise<any> {
    try {
      // Octokitが初期化されていることを確認
      if (!this.octokit) {
        await this.initOctokit();
      }
      
      const { data } = await this.octokit.rest.repos.get({
        owner,
        repo
      });
      
      return data;
    } catch (error) {
      logger.error(`リポジトリ情報の取得に失敗: ${(error as Error).message}`);
      throw error;
    }
  }
}
