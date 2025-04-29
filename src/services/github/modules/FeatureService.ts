/**
 * 機能実装関連の機能
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../../tools/logger';
import { CodeGenerator } from '../codeGenerator';
import { GitHubServiceBase } from './GitHubServiceBase';
import { FeatureImplementationResult } from './types';
import { RepositoryService } from './RepositoryService';

export class FeatureService extends GitHubServiceBase {
  private repoService: RepositoryService;

  constructor(repoService: RepositoryService) {
    super();
    this.repoService = repoService;
  }

  /**
   * タスク内容に基づいて新機能を実装する
   */
  public async implementFeature(taskDescription: string, branchName: string): Promise<FeatureImplementationResult> {
    try {
      if (!this.repositoryAnalyzer) {
        throw new Error('リポジトリが初期化されていません。initRepository を先に呼び出してください。');
      }
      
      const repoPath = (this.repositoryAnalyzer as any)['repoPath'];
      
      logger.info(`機能実装開始: ${taskDescription} (ブランチ: ${branchName})`);
      
      // ブランチを作成（または既存のブランチを使用）
      await this.repoService.createBranch(branchName);
      
      // リポジトリを分析
      const analysisResult = await this.repositoryAnalyzer.analyzeRepository();
      
      // コード生成器を初期化
      const codeGenerator = new CodeGenerator({
        repoPath,
        taskDescription,
        analysisResult,
        owner: this.owner,
        repo: this.repo
      });
      
      // コードを生成
      const generationResult = await codeGenerator.generateCode();
      
      // 生成されたファイルをリポジトリに追加
      const addedFiles: string[] = [];
      
      for (const file of generationResult.generatedFiles) {
        const filePath = path.join(repoPath, file.path);
        const fileDir = path.dirname(filePath);
        
        // ディレクトリが存在しない場合は作成
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        
        // ファイルを作成
        fs.writeFileSync(filePath, file.content, 'utf8');
        addedFiles.push(file.path);
      }
      
      logger.info(`ファイル生成完了: ${addedFiles.join(', ')}`);
      
      // 変更をコミット
      await this.repoService.commitChanges(addedFiles, `feat: ${taskDescription}`);
      
      return {
        files: addedFiles,
        message: `${addedFiles.length} ファイルが生成されました: ${addedFiles.join(', ')}`
      };
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`機能実装中にエラーが発生: ${errorMsg}`);
      throw new Error(`機能実装に失敗しました: ${errorMsg}`);
    }
  }

  /**
   * フィードバックに基づいて機能を追加・修正する
   */
  public async addFeatureFromFeedback(
    branchName: string,
    feedbackDescription: string
  ): Promise<FeatureImplementationResult> {
    try {
      if (!this.repositoryAnalyzer) {
        throw new Error('リポジトリが初期化されていません。');
      }
      
      const repoPath = (this.repositoryAnalyzer as any)['repoPath'];
      const repoContext = this.getRepositoryContext();
      
      if (!repoContext) {
        throw new Error('リポジトリコンテキストが取得できません。');
      }
      
      logger.info(`フィードバックに基づく機能追加開始: ${feedbackDescription} (ブランチ: ${branchName})`);
      
      // リポジトリを再分析
      const analysisResult = await this.repositoryAnalyzer.analyzeRepository();
      
      // コード生成器を初期化
      const codeGenerator = new CodeGenerator({
        repoPath,
        taskDescription: feedbackDescription,
        analysisResult,
        owner: this.owner,
        repo: this.repo
      });
      
      // コードを生成
      const generationResult = await codeGenerator.generateCode();
      
      // 生成されたファイルをリポジトリに追加
      const modifiedFiles: string[] = [];
      
      for (const file of generationResult.generatedFiles) {
        const filePath = path.join(repoPath, file.path);
        const fileDir = path.dirname(filePath);
        
        // ディレクトリが存在しない場合は作成
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        
        // ファイルを作成または更新
        fs.writeFileSync(filePath, file.content, 'utf8');
        modifiedFiles.push(file.path);
      }
      
      logger.info(`ファイル生成完了: ${modifiedFiles.join(', ')}`);
      
      // 変更をコミット
      await this.repoService.commitChanges(modifiedFiles, `feat: ${feedbackDescription}`);
      
      return {
        files: modifiedFiles,
        message: `${modifiedFiles.length} ファイルが更新されました: ${modifiedFiles.join(', ')}`
      };
    } catch (error: unknown) {
      const errorMsg = this.getErrorMessage(error);
      logger.error(`フィードバックからの機能追加中にエラーが発生: ${errorMsg}`);
      throw new Error(`フィードバックからの機能追加に失敗しました: ${errorMsg}`);
    }
  }
}
