/**
 * 拡張GitHub連携機能タスクエグゼキューター
 * AgentCoreと連携してGitHub関連タスクを実行
 */

import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EnhancedGitHubService, RepositoryAnalyzer } from '../../services/github';
import { logger } from '../../tools/logger';
import { config } from '../../config/config';
import { TaskManager } from './TaskManager';
import { NotificationService } from '../services/notificationService';
import { PlatformType, NotificationTarget } from '../../platforms/types';

export interface GitHubTaskParams {
  repoUrl: string;
  taskDescription: string;
  branchName?: string;
  baseBranch?: string;
  createPR?: boolean;
  reviewPR?: boolean;
  autoMerge?: boolean;
  taskId?: string;
  platformId?: string;
  channelId?: string;
  userId?: string;
  messageId?: string;
}

export interface GitHubTaskResult {
  success: boolean;
  message: string;
  filesCreated?: string[];
  prUrl?: string;
  prNumber?: number;
  warnings?: string[];
}

export class EnhancedGitHubExecutor {
  private githubService: EnhancedGitHubService;
  private taskManager: TaskManager;
  private notificationService: NotificationService;
  
  constructor(taskManager: TaskManager, notificationService: NotificationService) {
    this.githubService = new EnhancedGitHubService({
      token: config.GITHUB_TOKEN,
      workDir: path.join(config.PROJECTS_DIR, 'github_repos')
    });
    
    this.taskManager = taskManager;
    this.notificationService = notificationService;
  }
  
  /**
   * GitHub関連タスクを実行
   */
  public async executeGitHubTask(params: GitHubTaskParams): Promise<GitHubTaskResult> {
    // タスクIDが指定されていない場合は新しく生成
    const taskId = params.taskId || `github_${uuidv4()}`;
    
    try {
      // タスクを登録
      const target: NotificationTarget = {
        platformType: (params.platformId as PlatformType) || 'github',
        channelId: params.channelId || '',
        userId: params.userId || ''
      };
      await this.taskManager.registerTask(taskId, params.taskDescription, target);
      
      // リポジトリURLからオーナーとリポジトリ名を抽出
      const { owner, repo } = this.parseRepositoryUrl(params.repoUrl);
      
      if (!owner || !repo) {
        throw new Error('リポジトリURLが無効です。形式: https://github.com/owner/repo');
      }
      
      // 実行状況を更新
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.1, target, '初期化中...');
      
      // リポジトリを初期化
      await this.githubService.initRepository(owner, repo);
      
      // 実行状況を更新
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.2, target, 'リポジトリを分析中...');
      
      // ブランチ名を設定（指定がなければフォーマットされたタスク説明から生成）
      const branchName = params.branchName || this.generateBranchName(params.taskDescription);
      
      // ベースブランチを設定（指定がなければmainを使用）
      const baseBranch = params.baseBranch || 'main';
      
      // 実行状況を更新
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.3, target, `ブランチ '${branchName}' を作成中...`);
      
      // 通知を送信
      await this.notificationService.sendNotification(target, {
        text: `GitHub連携: リポジトリ ${owner}/${repo} を初期化しました。ブランチ '${branchName}' を作成中...`
      });
      
      // タスクの実行結果初期化
      const result: GitHubTaskResult = {
        success: false,
        message: '',
        warnings: []
      };
      
      // 新機能を実装
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.4, target, '機能を実装中...');
      
      const implementationResult = await this.githubService.implementFeature(
        params.taskDescription,
        branchName
      );
      
      result.filesCreated = implementationResult.files;
      
      // 実行状況を更新
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.7, target, '変更をプッシュ中...');
      
      // 変更をプッシュ
      await this.githubService.pushChanges(branchName);
      
      // PRを作成する場合
      if (params.createPR) {
        await this.taskManager.updateTaskProgress(taskId, 'coding', 0.8, target, 'プルリクエストを作成中...');
        
        // PRを作成
        const prResult = await this.githubService.createPullRequest(
          `${params.taskDescription}`,
          branchName,
          baseBranch
        );
        
        result.prUrl = prResult.url;
        result.prNumber = prResult.number;
        
        // 通知を送信
        await this.notificationService.sendNotification(target, {
          text: `GitHub連携: プルリクエスト #${prResult.number} を作成しました: ${prResult.url}`
        });
        
        // PRレビューを行う場合
        if (params.reviewPR && prResult.number) {
          await this.taskManager.updateTaskProgress(taskId, 'coding', 0.9, target, 'プルリクエストをレビュー中...');
          
          // レビューを実行
          await this.githubService.reviewPullRequest(prResult.number);
          
          // 通知を送信
          await this.notificationService.sendNotification(target, {
            text: `GitHub連携: プルリクエスト #${prResult.number} のレビューを実施しました`
          });
        }
        
        // 自動マージする場合
        if (params.autoMerge && prResult.number) {
          await this.taskManager.updateTaskProgress(taskId, 'coding', 0.95, target, 'プルリクエストをマージ中...');
          
          // マージを実行
          const mergeResult = await this.githubService.mergePullRequest(prResult.number, 'merge');
          
          if (mergeResult) {
            result.warnings?.push('プルリクエストの自動マージに成功しました');
          } else {
            result.warnings?.push('プルリクエストの自動マージに失敗しました');
          }
          
          // 通知を送信
          await this.notificationService.sendNotification(target, {
            text: `GitHub連携: プルリクエスト #${prResult.number} の${mergeResult ? 'マージに成功' : 'マージに失敗'}しました`
          });
        }
      }
      
      // タスク完了
      await this.taskManager.updateTaskProgress(taskId, 'complete', 1.0, target, '完了');
      this.taskManager.setTaskCompleted(taskId, '完了');
      
      // 成功結果を設定
      result.success = true;
      result.message = implementationResult.message;
      
      if (result.prUrl) {
        result.message += `\nプルリクエスト: ${result.prUrl}`;
      }
      
      // 通知を送信
      await this.notificationService.sendNotification(target, {
        text: `GitHub連携タスクが完了しました: ${result.message}`
      });
      
      return result;
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`GitHub連携タスクでエラーが発生: ${errorMsg}`);
      this.taskManager.setTaskFailed(taskId, new Error(errorMsg));
      await this.notificationService.sendNotification(
        {
          platformType: (params.platformId as PlatformType) || 'github',
          channelId: params.channelId || '',
          userId: params.userId || ''
        },
        {
          text: `GitHub連携タスクでエラーが発生しました: ${errorMsg}`
        }
      );
      return {
        success: false,
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }
  
  /**
   * フィードバックに基づいてコードを修正する
   */
  public async processFeedback(
    taskId: string,
    feedbackText: string,
    platformId?: string,
    channelId?: string,
    userId?: string,
    messageId?: string
  ): Promise<GitHubTaskResult> {
    try {
      // タスク情報を取得
      const task = this.taskManager.getTaskInfo(taskId);
      
      if (!task) {
        throw new Error(`タスクID ${taskId} が見つかりません`);
      }
      
      // タスクがGitHub関連でない場合
      if (task.type !== 'github') {
        throw new Error(`タスクID ${taskId} はGitHub連携タスクではありません`);
      }
      
      // リポジトリURLとブランチ名を取得
      // ProjectInfo型にはdataがないため、repoUrl/branchNameは取得不可
      throw new Error('processFeedback内でrepoUrl/branchNameが取得できません。呼び出し元で引数として渡してください。');
      // const repoUrl = task.data?.repoUrl as string;
      // let branchName = task.data?.branchName as string;
      
      /*
      if (!repoUrl) {
        throw new Error('リポジトリURLが見つかりません');
      }
      
      // リポジトリURLからオーナーとリポジトリ名を抽出
      const { owner, repo } = this.parseRepositoryUrl(repoUrl);
      
      if (!owner || !repo) {
        throw new Error('リポジトリURLが無効です');
      }
      
      // タスク状態を更新
      // updateTaskStatusは現APIに存在しないため削除
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.1, {
        platformType: (platformId as PlatformType) || 'github',
        channelId: channelId || '',
        userId: userId || ''
      }, 'フィードバックを処理中...');
      
      // 通知を送信
      await this.notificationService.sendNotification({
        platformType: (platformId as PlatformType) || 'github',
        channelId: channelId || '',
        userId: userId || ''
      }, {
        text: `GitHub連携: フィードバック "${feedbackText}" を処理しています...`
      });
      
      // リポジトリを初期化
      await this.githubService.initRepository(owner, repo);
      
      // ブランチ名が未設定の場合はタスク説明から生成
      if (!branchName) {
        // ProjectInfo型にはdescriptionがないため、branchName生成不可
        throw new Error('タスク情報に説明がありません');
        // branchName = this.generateBranchName(task.description);
        
        // タスクデータを更新
        // updateTaskDataは現APIに存在しないため削除
      }
      
      // 実行状況を更新
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.3, {
        platformType: (platformId as PlatformType) || 'github',
        channelId: channelId || '',
        userId: userId || ''
      }, `フィードバックに基づき機能を追加中...`);
      
      // フィードバックに基づいて機能を追加
      const implementationResult = await this.githubService.addFeatureFromFeedback(
        branchName,
        feedbackText
      );
      
      // 実行状況を更新
      await this.taskManager.updateTaskProgress(taskId, 'coding', 0.6, {
        platformType: (platformId as PlatformType) || 'github',
        channelId: channelId || '',
        userId: userId || ''
      }, '変更をプッシュ中...');
      
      // 変更をプッシュ
      await this.githubService.pushChanges(branchName);
      */
      
      // タスク完了
      await this.taskManager.updateTaskProgress(taskId, 'complete', 1.0, {
        platformType: (platformId as PlatformType) || 'github',
        channelId: channelId || '',
        userId: userId || ''
      }, '完了');
      this.taskManager.setTaskCompleted(taskId, '完了');
      
      // 成功結果を設定
      const result: GitHubTaskResult = {
        success: true,
        message: '',
        filesCreated: []
      };
      
      // 通知を送信
      await this.notificationService.sendNotification({
        platformType: (platformId as PlatformType) || 'github',
        channelId: channelId || '',
        userId: userId || ''
      }, {
        text: `GitHub連携: フィードバックの処理が完了しました: ${result.message}`
      });
      
      return result;
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`フィードバック処理でエラーが発生: ${errorMsg}`);
      this.taskManager.setTaskFailed(taskId, new Error(errorMsg));
      await this.notificationService.sendNotification({
        platformType: (platformId as PlatformType) || 'github',
        channelId: channelId || '',
        userId: userId || ''
      }, {
        text: `GitHub連携: フィードバック処理でエラーが発生しました: ${errorMsg}`
      });
      return {
        success: false,
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }
  
  /**
   * リポジトリURLからオーナーとリポジトリ名を抽出
   */
  private parseRepositoryUrl(url: string): { owner: string; repo: string } {
    try {
      // URLからパスを抽出
      let path: string;
      
      if (url.startsWith('http')) {
        const parsedUrl = new URL(url);
        path = parsedUrl.pathname;
      } else if (url.startsWith('git@')) {
        // SSH形式の場合
        const match = url.match(/git@github\.com:([^/]+)\/(.+)\.git/);
        if (match) {
          return { owner: match[1], repo: match[2] };
        }
        path = url;
      } else {
        // owner/repo 形式と仮定
        path = url;
      }
      
      // パスから余分な部分を削除
      path = path.replace(/^\//, '').replace(/\.git$/, '');
      
      // パスを分割
      const parts = path.split('/');
      
      if (parts.length >= 2) {
        return {
          owner: parts[0],
          repo: parts[1]
        };
      }
      
      throw new Error('リポジトリURLの形式が正しくありません');
    } catch (error) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`リポジトリURL解析エラー: ${errorMsg}`);
      return { owner: '', repo: '' };
    }
  }
  
  /**
   * タスク説明からGitブランチ名を生成
   */
  private generateBranchName(description: string): string {
    // 説明をケバブケースに変換
    const kebabCase = description
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '')
      .replace(/-+/g, '-')
      .substring(0, 50);  // 長すぎる場合は切り詰める
    
    // 接頭辞とタイムスタンプを追加
    const timestamp = new Date().getTime().toString().slice(-6);
    return `feature/${kebabCase}-${timestamp}`;
  }
}
