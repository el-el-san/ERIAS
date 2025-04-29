/**
 * コマンドハンドラー
 * プラットフォーム共通のコマンド処理を提供
 */

import { v4 as uuidv4 } from 'uuid';
import agentCore from '../agent/agentCore';
import { logger } from '../tools/logger';

export interface CommandContext {
  platformId: string;
  channelId: string;
  userId: string;
  messageId: string;
}

export class CommandHandler {
  /**
   * プロジェクト生成コマンドを処理
   */
  public async handleNewProject(
    spec: string,
    context: CommandContext
  ): Promise<{ success: boolean; taskId: string; message: string }> {
    try {
      logger.info(`新規プロジェクト作成コマンドを受信: ${spec}`);
      
      // プロジェクト生成タスクを開始
      const taskId = await agentCore.createProject(
        spec,
        context.platformId,
        context.channelId,
        context.userId,
        context.messageId
      );
      
      return {
        success: true,
        taskId,
        message: `プロジェクト生成タスクを開始しました。タスクID: ${taskId}`
      };
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`プロジェクト生成コマンド処理エラー: ${errorMsg}`);
      return {
        success: false,
        taskId: '',
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }

  /**
   * ステータス確認コマンドを処理
   */
  public async handleStatus(
    taskId: string
  ): Promise<{ success: boolean; task: any; message: string }> {
    try {
      logger.info(`ステータス確認コマンドを受信: ${taskId}`);
      
      // タスク状態を取得
      const task = agentCore.getTaskStatus(taskId);
      
      if (!task) {
        return {
          success: false,
          task: null,
          message: `タスクID ${taskId} が見つかりません`
        };
      }
      
      return {
        success: true,
        task,
        message: `タスクID: ${taskId}\nステータス: ${task.status}\n進捗: ${task.progress}%\n説明: ${task.description}`
      };
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`ステータス確認コマンド処理エラー: ${errorMsg}`);
      return {
        success: false,
        task: null,
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }

  /**
   * キャンセルコマンドを処理
   */
  public async handleCancel(
    taskId: string,
    context: CommandContext
  ): Promise<{ success: boolean; message: string }> {
    try {
      logger.info(`キャンセルコマンドを受信: ${taskId}`);
      
      // タスクをキャンセル
      const result = await agentCore.cancelTask(taskId, context.userId);
      
      if (!result) {
        return {
          success: false,
          message: `タスクID ${taskId} が見つからないか、キャンセルできませんでした`
        };
      }
      
      return {
        success: true,
        message: `タスクID ${taskId} をキャンセルしました`
      };
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`キャンセルコマンド処理エラー: ${errorMsg}`);
      return {
        success: false,
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }

  /**
   * ヘルプコマンドを処理
   */
  public async handleHelp(): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('ヘルプコマンドを受信');
      
      const helpMessage = `# ERIAS コマンドヘルプ

## 基本コマンド
- \`/newproject [仕様]\` - 新しいプロジェクトを生成
- \`/status [タスクID]\` - プロジェクトの進捗状況を確認
- \`/cancel [タスクID]\` - 実行中のプロジェクトをキャンセル
- \`/help\` - このヘルプを表示

## GitHub連携コマンド
- \`/githubrepo [リポジトリURL] [タスク]\` - 既存リポジトリに機能を追加
- \`/generatefile [リポジトリURL] [ファイルパス] [説明]\` - 特定のファイルを生成
- \`/reviewpr [リポジトリURL] [PR番号]\` - PRをレビュー

## フィードバック機能
実行中のプロジェクトに対して追加の指示を提供できます：
\`\`\`
task:タスクID [指示内容]
\`\`\`

特殊タグ：
- \`#urgent\` または \`#緊急\` - 緊急の指示として処理
- \`#feature\` または \`#機能\` - 新機能の追加
- \`#fix\` または \`#修正\` - バグ修正
- \`#code\` または \`#コード\` - コード修正
- \`file:パス\` - 特定ファイルへの指示

## 画像生成機能
通常の会話で画像生成をリクエストできます：

\`「○○の画像を生成して」\`
\`「○○のイメージを作って」\`
\`"generate image of ..."\`
\`"create an image of ..."\`

ERIASが自動的に生成リクエストを検出し、適切なプロンプトを最適化してGemini 2.0 Flashを使用して画像を出力します。`;
      
      return {
        success: true,
        message: helpMessage
      };
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`ヘルプコマンド処理エラー: ${errorMsg}`);
      return {
        success: false,
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }

  /**
   * GitHubリポジトリコマンドを処理
   */
  public async handleGitHubRepo(
    repoUrl: string,
    taskDescription: string,
    context: CommandContext,
    options: {
      branchName?: string;
      baseBranch?: string;
      createPR?: boolean;
      reviewPR?: boolean;
      autoMerge?: boolean;
    } = {}
  ): Promise<{ success: boolean; taskId: string; message: string }> {
    try {
      logger.info(`GitHubリポジトリコマンドを受信: ${repoUrl}, ${taskDescription}`);
      
      // GitHub連携タスクを開始
      const taskId = await agentCore.executeGitHubTask({
        repoUrl,
        taskDescription,
        branchName: options.branchName,
        baseBranch: options.baseBranch,
        createPR: options.createPR !== false, // デフォルトtrue
        reviewPR: options.reviewPR !== false, // デフォルトtrue
        autoMerge: options.autoMerge || false, // デフォルトfalse
        platformId: context.platformId,
        channelId: context.channelId,
        userId: context.userId,
        messageId: context.messageId
      });
      
      return {
        success: true,
        taskId,
        message: `GitHub連携タスクを開始しました。タスクID: ${taskId}`
      };
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`GitHubリポジトリコマンド処理エラー: ${errorMsg}`);
      return {
        success: false,
        taskId: '',
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }

  /**
   * タスクフィードバックを処理
   */
  public async handleTaskFeedback(
    taskId: string,
    feedback: string,
    context: CommandContext
  ): Promise<{ success: boolean; message: string }> {
    try {
      logger.info(`タスクフィードバックを受信: ${taskId}, ${feedback}`);
      
      // タスク状態を取得
      const task = agentCore.getTaskStatus(taskId);
      
      if (!task) {
        return {
          success: false,
          message: `タスクID ${taskId} が見つかりません`
        };
      }
      
      // タスクタイプに応じた処理
      if (task.type === 'github') {
        // GitHub連携タスクの場合
        const result = await agentCore.processGitHubFeedback(
          taskId,
          feedback,
          context.platformId,
          context.channelId,
          context.userId,
          context.messageId
        );
        
        if (result.success) {
          return {
            success: true,
            message: `フィードバックを処理しました: ${result.message}`
          };
        } else {
          return {
            success: false,
            message: result.message
          };
        }
      } else {
        // その他のタスク（プロジェクト生成など）
        const result = await agentCore.addFeedbackToTask(
          taskId,
          feedback,
          context.platformId,
          context.channelId,
          context.userId,
          context.messageId
        );
        
        return {
          success: result,
          message: result
            ? 'フィードバックをタスクに追加しました'
            : 'フィードバックの追加に失敗しました'
        };
      }
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`タスクフィードバック処理エラー: ${errorMsg}`);
      return {
        success: false,
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }
  
  /**
   * GitHub拡張機能のコマンドパターンを処理
   * ファイル生成、PRレビュー、マージなどを個別に実装
   */
  
  /**
   * ファイル生成コマンドを処理
   */
  public async handleGenerateFile(
    repoUrl: string,
    filePath: string,
    fileDescription: string,
    context: CommandContext
  ): Promise<{ success: boolean; taskId: string; message: string }> {
    try {
      logger.info(`ファイル生成コマンドを受信: ${repoUrl}, ${filePath}, ${fileDescription}`);
      
      // GitHub連携タスクを開始
      const taskId = await agentCore.executeGitHubTask({
        repoUrl,
        taskDescription: `ファイル生成: ${filePath} - ${fileDescription}`,
        branchName: undefined,
        baseBranch: undefined,
        createPR: true,
        reviewPR: undefined,
        autoMerge: undefined,
        platformId: context.platformId,
        channelId: context.channelId,
        userId: context.userId,
        messageId: context.messageId
      });
      
      return {
        success: true,
        taskId,
        message: `ファイル生成タスクを開始しました。タスクID: ${taskId}\nファイル: ${filePath}`
      };
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`ファイル生成コマンド処理エラー: ${errorMsg}`);
      return {
        success: false,
        taskId: '',
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }
  
  /**
   * PRレビューコマンドを処理
   */
  public async handleReviewPR(
    repoUrl: string,
    prNumber: number,
    context: CommandContext
  ): Promise<{ success: boolean; message: string }> {
    try {
      logger.info(`PRレビューコマンドを受信: ${repoUrl}, PR #${prNumber}`);
      
      // GitHub連携タスクを開始
      const taskId = await agentCore.executeGitHubTask({
        repoUrl,
        taskDescription: `PR #${prNumber} のレビュー`,
        createPR: false,
        reviewPR: true,
        platformId: context.platformId,
        channelId: context.channelId,
        userId: context.userId,
        messageId: context.messageId
      });
      
      return {
        success: true,
        message: `PRレビュータスクを開始しました。タスクID: ${taskId}\nPR番号: #${prNumber}`
      };
    } catch (error: unknown) {
      let errorMsg = '不明なエラー';
      if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
        errorMsg = (error as any).message;
      }
      logger.error(`PRレビューコマンド処理エラー: ${errorMsg}`);
      return {
        success: false,
        message: `エラーが発生しました: ${errorMsg}`
      };
    }
  }
}
