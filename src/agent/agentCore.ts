/**
 * エージェントコア
 * 開発プロセス全体のオーケストレーション
 */
import { NotificationTarget } from '../platforms/types';
import { TaskStatus, FeedbackOptions } from './core/types';
import { AgentCore as CoreImplementation } from './core/AgentCore';

// シングルトンパターンでAgentCoreを実装
let instance: AgentCore | null = null;

export class AgentCore {
  private core: CoreImplementation;

  private constructor() {
    this.core = new CoreImplementation();
  }

  /**
   * シングルトンインスタンスの取得
   */
  public static getInstance(): AgentCore {
    if (!instance) {
      instance = new AgentCore();
    }
    return instance;
  }

  /**
   * LLMを使用してユーザーメッセージに応答を生成
   */
  async generateResponse(message: string, target: NotificationTarget): Promise<string> {
    return this.core.generateResponse(message, target);
  }

  /**
   * 新規プロジェクト作成の開始
   */
  async startNewProject(spec: string, target: NotificationTarget): Promise<string> {
    return this.core.startNewProject(spec, target);
  }

  /**
   * GitHub連携タスクの開始
   */
  async startGitHubTask(repoUrl: string, task: string, target: NotificationTarget): Promise<string> {
    return this.core.startGitHubTask(repoUrl, task, target);
  }

  /**
   * 画像生成
   */
  async generateImage(prompt: string, target: NotificationTarget): Promise<Buffer | null> {
    return this.core.generateImage(prompt, target);
  }

  /**
   * タスク状態の取得
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.core.getTaskStatus(taskId);
  }

  /**
   * タスクのキャンセル
   */
  async cancelTask(taskId: string, userId: string): Promise<boolean> {
    return this.core.cancelTask(taskId, userId);
  }

  /**
   * タスクへのフィードバック処理
   */
  async processFeedback(taskId: string, feedback: string, options: FeedbackOptions): Promise<boolean> {
    return this.core.processFeedback(taskId, feedback, options);
  }
}

// エクスポートの簡略化のため、インスタンスを提供するヘルパー関数
export function getAgentCore(): AgentCore {
  return AgentCore.getInstance();
}
