/**
 * ファイル操作関連の機能
 */

import { logger } from '../../../tools/logger';
import { GitHubServiceBase } from './GitHubServiceBase';

export class FileService extends GitHubServiceBase {
  /**
   * リポジトリを初期化する
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   * @returns リポジトリパス
   */
  public async initRepository(owner: string, repo: string): Promise<string> {
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
      logger.error(`ファイル読み取り中にエラーが発生: ${errorMsg}`);
      throw new Error(`ファイル読み取りに失敗しました: ${errorMsg}`);
    }
  }

  /**
   * ファイルを更新する
   */
  public async updateFile(filePath: string, content: string, message: string, branch: string): Promise<void> {
    try {
      logger.info(`ファイル更新: ${filePath} (ブランチ: ${branch})`);
      
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
      
      logger.info(`ファイル更新完了: ${filePath}`);
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`ファイル更新中にエラーが発生: ${errorMsg}`);
      throw new Error(`ファイル更新に失敗しました: ${errorMsg}`);
    }
  }

  /**
   * ファイルを作成する
   */
  public async createFile(filePath: string, content: string, message: string, branch: string): Promise<void> {
    try {
      logger.info(`ファイル作成: ${filePath} (ブランチ: ${branch})`);
      
      // ファイルを作成
      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        message,
        content: Buffer.from(content).toString('base64'),
        branch
      });
      
      logger.info(`ファイル作成完了: ${filePath}`);
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`ファイル作成中にエラーが発生: ${errorMsg}`);
      throw new Error(`ファイル作成に失敗しました: ${errorMsg}`);
    }
  }

  /**
   * ファイルを削除する
   */
  public async deleteFile(filePath: string, message: string, branch: string): Promise<void> {
    try {
      logger.info(`ファイル削除: ${filePath} (ブランチ: ${branch})`);
      
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
      
      logger.info(`ファイル削除完了: ${filePath}`);
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`ファイル削除中にエラーが発生: ${errorMsg}`);
      throw new Error(`ファイル削除に失敗しました: ${errorMsg}`);
    }
  }
}
