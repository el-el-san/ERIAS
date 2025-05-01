/**
 * ERIAS AgentCore
 * AIエージェントのコアAPI - GitHub連携強化機能を統合
 * 
 * @file agentCore.ts
 * @author ERIAS AI
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentCore as CoreImpl } from '../core/AgentCore';
import { TaskManager } from '../core/TaskManager';
import { ProjectExecutor } from '../core/Executor/ProjectExecutor';
import { EnhancedGitHubExecutor, GitHubTaskParams, GitHubTaskResult } from '../core/Executor/EnhancedGitHubExecutor';
import { NotificationService } from '../core/notificationService';
import { ProjectGenerator } from '../modules/projectGenerator';
import Planner from '../modules/planner';
import { Coder } from '../modules/coder';
import Tester from '../modules/tester';
import Debugger from '../modules/debugger';
import { FeedbackHandler } from '../modules/feedbackHandler';
import { GeminiClient } from '../llm/geminiClient';
import { PromptBuilder } from '../llm/promptBuilder';
import { PlatformType, NotificationTarget } from '../types/agentTypes';
import { FeedbackOptions } from '../core/types';
import { ImageGenerator } from '../generators/imageGenerator';

/**
 * エージェントコアのファサードクラス
 * 
 * 外部からのアクセスポイントとして、基本的なAPIを提供します。
 * 内部的には複数のモジュールに処理を委譲します。
 */
class AgentCore {
  private coreImpl: CoreImpl;
  private taskManager: TaskManager;
  private projectExecutor: ProjectExecutor;
  private enhancedGitHubExecutor: EnhancedGitHubExecutor;
  private notificationService: NotificationService;
  private geminiClient: GeminiClient;
  private promptBuilder: PromptBuilder;
  private imageGenerator: ImageGenerator;

  constructor() {
    // 依存関係の初期化
    this.taskManager = new TaskManager();
    this.notificationService = NotificationService.getInstance();

    // LLM依存インスタンス生成
    this.geminiClient = new GeminiClient();
    this.promptBuilder = new PromptBuilder();
    this.imageGenerator = new ImageGenerator();

    // ProjectGenerator用依存インスタンス生成
    const planner = new Planner(this.geminiClient, this.promptBuilder);
    const coder = new Coder(this.geminiClient, this.promptBuilder);
    const tester = new Tester();
    const debugger_ = new Debugger(this.geminiClient, this.promptBuilder);
    const feedbackHandler = new FeedbackHandler(planner, coder);

    const projectGenerator = new ProjectGenerator(
      planner,
      coder,
      tester,
      debugger_,
      feedbackHandler
    );

    // 各実行モジュールの初期化
    this.projectExecutor = new ProjectExecutor(projectGenerator, this.taskManager);
    this.enhancedGitHubExecutor = new EnhancedGitHubExecutor(this.taskManager, this.notificationService);

    // コア実装の初期化
    this.coreImpl = new CoreImpl();
  }

  /**
   * プロジェクト生成タスクを作成・実行する
   */
  public async createProject(
    spec: string,
    platformId: string,
    channelId: string,
    userId: string,
    messageId: string
  ): Promise<string> {
    // タスクIDを生成
    const taskId = `project_${uuidv4()}`;
    
    // タスクを非同期で実行
    // NotificationTarget生成
    const notificationTarget: NotificationTarget = {
      userId,
      platformType: platformId === 'slack' ? PlatformType.SLACK : PlatformType.DISCORD, // platformIdを解析して正しいプラットフォームタイプを設定
      channelId
    };
    this.coreImpl.startNewProject(
      spec,
      notificationTarget
    ).catch((error: unknown) => {
      console.error('Project generation error:', error);
    });
    
    return taskId;
  }

  /**
   * GitHub連携タスクを作成・実行する
   */
  public async executeGitHubTask(params: GitHubTaskParams): Promise<string> {
    // タスクIDを生成または使用
    const taskId = params.taskId || `github_${uuidv4()}`;
    
    // タスクを非同期で実行
    this.enhancedGitHubExecutor.executeGitHubTask({
      ...params,
      taskId
    }).catch((error: unknown) => {
      console.error('GitHub task execution error:', error);
    });
    
    return taskId;
  }
  
  /**
   * GitHub連携タスクにフィードバックを提供して修正を実行
   */
  public async processGitHubFeedback(
    taskId: string,
    feedbackText: string,
    platformId?: string,
    channelId?: string,
    userId?: string,
    messageId?: string
  ): Promise<GitHubTaskResult> {
    return this.enhancedGitHubExecutor.processFeedback(
      taskId,
      feedbackText,
      platformId,
      channelId,
      userId,
      messageId
    );
  }

  /**
   * タスク状態を取得する
   */
  public getTaskStatus(taskId: string): any {
    return this.taskManager.getTaskInfo(taskId);
  }

  /**
   * フィードバックをタスクに追加する
   */
  public async addFeedbackToTask(
    taskId: string,
    feedback: string,
    platformId: string,
    channelId: string,
    userId: string,
    messageId: string
  ): Promise<boolean> {
    return this.coreImpl.processFeedback(
      taskId,
      feedback,
      {
        userId,
        platformType: platformId === 'slack' ? PlatformType.SLACK : PlatformType.DISCORD, // platformIdを解析して正しいプラットフォームタイプを設定
        channelId
      } as FeedbackOptions,
      // targetは省略（必要なら追加可）
    );
  }

  /**
   * タスクをキャンセルする
   */
  public async cancelTask(taskId: string, userId: string): Promise<boolean> {
    return await this.taskManager.cancelTask(taskId, userId);
  }

/**
   * 会話応答を生成する
   * @param prompt ユーザーからの入力メッセージ
   * @param options オプション
   * @returns 生成された応答
   */
  public async generateResponse(prompt: string, options: {
    userId: string;
    platformType: PlatformType;
    channelId: string;
  }): Promise<string> {
    try {
      // NotificationTargetオブジェクトに変換
      const target: NotificationTarget = {
        userId: options.userId,
        platformType: options.platformType,
        channelId: options.channelId
      };
      
      // 実装済みのAgentCoreクラスのgenerateResponseメソッドを呼び出す
      const { AgentCore } = require('../core/AgentCore');
      const agentCoreInstance = new AgentCore();
      return await agentCoreInstance.generateResponse(prompt, target);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate response: ${error.message}`);
      }
      throw new Error('Failed to generate response: Unknown error');
    }
  }

  /**
   * 画像を生成する
   * @param prompt 画像生成プロンプト
   * @param options オプション
   * @returns 生成された画像のバッファ
   */
  public async generateImage(prompt: string, options: {
    userId: string;
    platformType: PlatformType;
    channelId: string;
  }): Promise<Buffer | null> {
    try {
      // NotificationTargetオブジェクトに変換
      const target: NotificationTarget = {
        userId: options.userId,
        platformType: options.platformType,
        channelId: options.channelId
      };
      
      // 実装済みのAgentCoreクラスのgenerateImageメソッドを呼び出す
      const { AgentCore } = require('../core/AgentCore');
      const agentCoreInstance = new AgentCore();
      return await agentCoreInstance.generateImage(prompt, target);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate image: ${error.message}`);
      }
      throw new Error('Failed to generate image: Unknown error');
    }
  }
}

// シングルトンインスタンスをエクスポート
export default new AgentCore();
