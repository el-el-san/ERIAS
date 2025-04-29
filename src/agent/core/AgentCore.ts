/**
 * エージェントコア
 * 開発プロセス全体のオーケストレーション
 */
import path from 'path';
import fs from 'fs/promises';
import { NotificationTarget } from '../../platforms/types';
import { NotificationService } from '../services/notificationService';
import { GeminiClient } from '../../llm/geminiClient';
import { PromptBuilder } from '../../llm/promptBuilder';
import { ProjectGenerator } from '../projectGenerator';
import { Planner } from '../planner';
import { Coder } from '../coder';
import { Tester } from '../tester';
import { Debugger } from '../debugger';
import { FeedbackHandler } from '../feedbackHandler';
import { config } from '../../config/config';
import { logger } from '../../tools/logger';
import { FeedbackOptions, TaskStatus } from './types';
import { TaskManager } from './TaskManager';
import { ResponseGenerator } from './ResponseGenerator';
import { ProjectExecutor } from './ProjectExecutor';
import { GitHubExecutor } from './GitHubExecutor';
import { GoogleGeminiConfig } from '../../generators/types';
import { ProjectInfo, ProjectTask, ProjectStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class AgentCore {
  private taskManager: TaskManager;
  private responseGenerator: ResponseGenerator;
  private projectExecutor: ProjectExecutor;
  private githubExecutor: GitHubExecutor;
  private notificationService: NotificationService;
  private imageGenerator: import('../../generators/imageGenerator').ImageGenerator;
  private coder: Coder;
  private tester: Tester;

  constructor() {
    this.notificationService = NotificationService.getInstance();
    this.taskManager = new TaskManager();
    
    // LLM関連コンポーネント初期化
    const geminiClient = new GeminiClient();
    const promptBuilder = new PromptBuilder();
    
    // 応答生成モジュール初期化
    this.responseGenerator = new ResponseGenerator(geminiClient, promptBuilder);
    
    // 各コンポーネントを初期化
    const planner = new Planner(geminiClient, promptBuilder);
    this.coder = new Coder(geminiClient, promptBuilder);
    this.tester = new Tester();
    const debugger_ = new Debugger(geminiClient, promptBuilder);
    const feedbackHandler = new FeedbackHandler(planner, this.coder);
    
    // プロジェクトジェネレーターを初期化
    const projectGenerator = new ProjectGenerator(planner, this.coder, this.tester, debugger_, feedbackHandler);
    
    // 実行モジュール初期化
    this.projectExecutor = new ProjectExecutor(projectGenerator, this.taskManager);
    this.githubExecutor = new GitHubExecutor(this.taskManager, this.coder, this.tester);

    // ImageGenerator初期化
    const geminiConfig = {
      apiKey: config.GOOGLE_API_KEY,
      model: config.DEFAULT_MODEL || 'gemini-2.0-flash-exp'
    };
    const { ImageGenerator } = require('../../generators/imageGenerator');
    this.imageGenerator = new ImageGenerator(geminiConfig);
  }

  /**
   * LLMを使用してユーザーメッセージに応答を生成
   */
  async generateResponse(message: string, target: NotificationTarget): Promise<string> {
    return this.responseGenerator.generateResponse(message, target);
  }

  /**
   * 新規プロジェクト作成の開始
   */
  async startNewProject(spec: string, target: NotificationTarget): Promise<string> {
    // タスクID生成
    const taskId = this.taskManager.generateTaskId();
    logger.info(`Starting new project with ID: ${taskId}`);
    
    // プロジェクトディレクトリのパスを作成
    const projectPath = path.join(config.PROJECTS_DIR || './projects', taskId);

    try {
      // ディレクトリが存在しない場合は作成
      await fs.mkdir(projectPath, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create project directory: ${projectPath}`, error);
      throw new Error(`プロジェクトディレクトリの作成に失敗しました: ${(error as Error).message}`);
    }
    
    // タスク状態の初期化
    this.taskManager.createTaskStatus(taskId, '計画立案を開始中...');
    
    // ProjectTask オブジェクトの作成
    this.taskManager.createProjectTask(taskId, spec, target.userId, target.channelId, projectPath);
    
    // 通知
    await this.notificationService.sendNotification(target, {
      text: `プロジェクト作成タスク（ID: ${taskId}）を開始しました。\n仕様：${spec}\n\n初期状態：計画立案フェーズ`
    });
    
    // 非同期でプロジェクト生成実行
    this.projectExecutor.executeProjectGeneration(taskId, target).catch(error => {
      logger.error(`Error executing project generation ${taskId}:`, error);
    });
    
    return taskId;
  }

  /**
   * GitHub連携タスクの開始
   */
  async startGitHubTask(repoUrl: string, task: string, target: NotificationTarget): Promise<string> {
    const taskId = uuidv4();
    logger.info(`Starting GitHub task with ID: ${taskId}`);
    
    // タスク登録
    await this.taskManager.registerTask(taskId, `GitHub: ${task}`, target);
    
    // プロジェクトディレクトリのパスを作成
    const projectPath = path.join(config.PROJECTS_DIR || './projects', taskId);

    try {
      // ディレクトリが存在しない場合は作成
      await fs.mkdir(projectPath, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create project directory: ${projectPath}`, error);
      throw new Error(`プロジェクトディレクトリの作成に失敗しました: ${(error as Error).message}`);
    }
    
    // ProjectTask オブジェクトの作成
    this.taskManager.createProjectTask(taskId, task, target.userId, target.channelId, projectPath);
    
    // 通知
    await this.notificationService.sendNotification(target, {
      text: `GitHub連携タスク（ID: ${taskId}）を開始しました。\nリポジトリ：${repoUrl}\nタスク：${task}\n\n初期状態：リポジトリ分析フェーズ`
    });
    
    // 非同期でGitHubタスク実行
    this.githubExecutor.executeGitHubTask(taskId, repoUrl, task, target).catch(error => {
      logger.error(`Error executing GitHub task ${taskId}:`, error);
    });
    
    return taskId;
  }

  /**
   * 画像生成
   */
  async generateImage(prompt: string, target: NotificationTarget): Promise<Buffer | null> {
    logger.info(`Generating image for prompt: ${prompt}`);
    
    try {
      // Gemini APIで画像生成
      if (!this.imageGenerator) {
        throw new Error('ImageGeneratorが初期化されていません');
      }
      const buffer = await this.imageGenerator.generateImage(prompt);
      return buffer;
    } catch (error) {
      logger.error(`Error generating image: ${error}`);
      return null;
    }
  }

  /**
   * タスク状態の取得
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskManager.getTaskStatus(taskId);
  }
  
  /**
   * タスクの詳細情報を取得
   * @param taskId タスクID
   */
  async getTaskInfo(taskId: string): Promise<ProjectInfo | null> {
    return this.taskManager.getTaskInfo(taskId);
  }

  /**
   * タスクのキャンセル
   */
  async cancelTask(taskId: string, userId?: string): Promise<boolean> {
    if (userId) {
      return this.taskManager.cancelTask(taskId, userId);
    } else {
      // cancelTaskByIdは存在しないのでcancelTaskを使用
      return this.taskManager.cancelTask(taskId, 'system');
    }
  }

  /**
   * タスクへのフィードバック処理
   */
  async processFeedback(
    taskId: string, 
    feedback: string, 
    options: FeedbackOptions,
    target?: NotificationTarget
  ): Promise<boolean> {
    return this.taskManager.processFeedback(taskId, feedback, options, target);
  }
}