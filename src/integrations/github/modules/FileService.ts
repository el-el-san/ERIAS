/**
 * ファイル操作関連の機能
 */

import * as fs from 'fs';
import * as path from 'path';
import logger, { logError } from '../../../utils/logger';
import { GitHubServiceBase } from './GitHubServiceBase';

export class FileService extends GitHubServiceBase {
  private repositoryService: any;

  /**
   * リポジトリを初期化する
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   * @param repositoryService RepositoryServiceへの参照（オプション）
   * @returns リポジトリパス
   */
  public async initRepository(owner: string, repo: string, repositoryService?: any): Promise<string> {
    // RepositoryServiceを保存
    if (repositoryService) {
      this.repositoryService = repositoryService;
    }
    
    // 親クラスのinitを呼び出す
    super.init(owner, repo);
    logger.info(`FileService: リポジトリ初期化 ${owner}/${repo}`);
    return `${owner}/${repo}`;
  }

  /**
   * ファイルを読み取る
   */
  public async readFile(filePath: string, branch: string = 'main'): Promise<string> {
    try {
      logger.info(`ファイル読み取り: ${filePath} (ブランチ: ${branch})`);
      
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        ref: branch
      });
      
      if ('content' in response.data && response.data.content) {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }
      
      throw new Error('ファイル内容を取得できませんでした');
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logError(error, `ファイル読み取り中にエラーが発生: ${errorMsg}`);
      throw new Error(`ファイル読み取りに失敗しました: ${errorMsg}`);
    }
  }

  /**
   * ファイルを更新する
   */
  public async updateFile(filePath: string, content: string, message: string, branch: string): Promise<void> {
    try {
      logger.info(`ファイル更新: ${filePath} (ブランチ: ${branch})`);
      
      // 修正ファイルリストに追加（RepositoryServiceが設定されている場合）
      if (this.repositoryService && typeof this.repositoryService.trackModifiedFile === 'function') {
        this.repositoryService.trackModifiedFile(filePath);
      }
      
      // ローカルリポジトリにファイルがある場合は、直接更新
      if (this.repositoryAnalyzer) {
        const repoPath = (this.repositoryAnalyzer as any)['repoPath'];
        const fullPath = path.join(repoPath, filePath);
        
        // ディレクトリが存在するか確認し、なければ作成
        const dirPath = path.dirname(fullPath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // ファイルを更新
        fs.writeFileSync(fullPath, content);
        logger.info(`ファイルをローカルに更新: ${fullPath}`);
        return;
      }
      
      // APIを使用してリモートリポジトリを更新
      try {
        // 現在のファイル内容とSHAを取得
        const currentFile = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          ref: branch
        });
        
        // ファイルのSHAを取得
        let fileSha = '';
        if ('sha' in currentFile.data) {
          fileSha = currentFile.data.sha;
        }
        
        // ファイルを更新
        await this.octokit.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          message,
          content: Buffer.from(content).toString('base64'),
          branch,
          sha: fileSha
        });
      } catch (apiError) {
        logger.warn(`API経由のファイル更新に失敗しました: ${this.getErrorMessage(apiError)}`);
      }
      
      logger.info(`ファイル更新完了: ${filePath}`);
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logError(error, `ファイル更新中にエラーが発生: ${errorMsg}`);
      throw new Error(`ファイル更新に失敗しました: ${errorMsg}`);
    }
  }

  /**
   * ファイルを作成する
   */
  public async createFile(filePath: string, content: string, message: string, branch: string): Promise<void> {
    try {
      logger.info(`ファイル作成: ${filePath} (ブランチ: ${branch})`);
      
      // 修正ファイルリストに追加（RepositoryServiceが設定されている場合）
      if (this.repositoryService && typeof this.repositoryService.trackModifiedFile === 'function') {
        this.repositoryService.trackModifiedFile(filePath);
      }
      
      // ローカルリポジトリにファイルを作成
      if (this.repositoryAnalyzer) {
        const repoPath = (this.repositoryAnalyzer as any)['repoPath'];
        const fullPath = path.join(repoPath, filePath);
        
        // ディレクトリが存在するか確認し、なければ作成
        const dirPath = path.dirname(fullPath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // ファイルを作成
        fs.writeFileSync(fullPath, content);
        logger.info(`ファイルをローカルに作成: ${fullPath}`);
        return;
      }
      
      // APIを使用してリモートリポジトリにファイルを作成
      try {
        // ファイルを作成
        await this.octokit.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          message,
          content: Buffer.from(content).toString('base64'),
          branch
        });
      } catch (apiError) {
        logger.warn(`API経由のファイル作成に失敗しました: ${this.getErrorMessage(apiError)}`);
      }
      
      logger.info(`ファイル作成完了: ${filePath}`);
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logError(error, `ファイル作成中にエラーが発生: ${errorMsg}`);
      throw new Error(`ファイル作成に失敗しました: ${errorMsg}`);
    }
  }

  /**
   * ファイルを削除する
   */
  public async deleteFile(filePath: string, message: string, branch: string): Promise<void> {
    try {
      logger.info(`ファイル削除: ${filePath} (ブランチ: ${branch})`);
      
      // ローカルリポジトリからファイルを削除
      if (this.repositoryAnalyzer) {
        const repoPath = (this.repositoryAnalyzer as any)['repoPath'];
        const fullPath = path.join(repoPath, filePath);
        
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          logger.info(`ファイルをローカルから削除: ${fullPath}`);
        } else {
          logger.warn(`ローカルファイルが存在しません: ${fullPath}`);
        }
        return;
      }
      
      // APIを使用してリモートリポジトリからファイルを削除
      try {
        // 現在のファイル情報を取得
        const fileInfo = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          ref: branch
        });
        
        // ファイルのSHAを取得
        let fileSha = '';
        if ('sha' in fileInfo.data) {
          fileSha = fileInfo.data.sha;
        }
        
        // ファイルを削除
        await this.octokit.repos.deleteFile({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          message,
          sha: fileSha,
          branch
        });
      } catch (apiError) {
        logger.warn(`API経由のファイル削除に失敗しました: ${this.getErrorMessage(apiError)}`);
      }
      
      logger.info(`ファイル削除完了: ${filePath}`);
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logError(error, `ファイル削除中にエラーが発生: ${errorMsg}`);
      throw new Error(`ファイル削除に失敗しました: ${errorMsg}`);
    }
  }
}