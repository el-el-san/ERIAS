import path from 'path';
import fs from 'fs/promises';
import { DevelopmentPlan, ProjectTask, Planner as PlannerInterface } from './types';
import { GeminiClient } from '../llm/geminiClient';
import { PromptBuilder, PromptType } from '../llm/promptBuilder';
import logger from '../utils/logger';
import { toolRegistry, ToolDefinition } from '../llm/toolRegistry';
import { fileSystemTools } from '../tools/fileSystem';

/**
 * 計画立案（プランニング）モジュール
 * ユーザーの要求仕様からプロジェクト計画を生成する
 */
export class Planner implements PlannerInterface {
  private geminiClient: GeminiClient;
  private promptBuilder: PromptBuilder;
  
  /**
   * Plannerを初期化
   * @param geminiClient Gemini APIクライアント
   * @param promptBuilder プロンプトビルダー
   */
  constructor(geminiClient: GeminiClient, promptBuilder: PromptBuilder) {
    this.geminiClient = geminiClient;
    this.promptBuilder = promptBuilder;
  }
  
  /**
   * 要求仕様から開発計画を生成する
   * @param task プロジェクトタスク
   */
  public async createPlan(task: ProjectTask): Promise<DevelopmentPlan> {
    logger.info(`Creating plan for project: ${task.id}`);
    
    try {
      // 計画立案用のツールを登録
      this.setupPlanningTools(task);
      
      // プロンプト変数を準備
      const variables = {
        projectName: path.basename(task.projectPath),
        specification: task.specification,
        currentTime: new Date().toISOString(),
      };
      
      // 計画立案用プロンプトを生成
      const prompt = this.promptBuilder.buildPlanPrompt(task.specification, variables);
      const systemPrompt = this.promptBuilder.buildSystemPrompt(variables);
      
      // Gemini API（Function Calling）で計画を生成
      logger.debug('Sending planning prompt to Gemini API');
      const planResponse = await this.geminiClient.runToolConversation(prompt, systemPrompt);
      
      // レスポンスをパース
      try {
        // レスポンスがJSON形式になっているかチェック
        if (!planResponse.trim().startsWith('{') && !planResponse.trim().startsWith('[')) {
          // JSON形式でない場合、JSONブロックを抽出
          const jsonMatch = planResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            const plan = JSON.parse(jsonMatch[1]) as DevelopmentPlan;
            return this.validateAndNormalizePlan(plan);
          }
          throw new Error('Failed to extract valid JSON from the response');
        }
        
        // 直接JSONをパース
        const plan = JSON.parse(planResponse) as DevelopmentPlan;
        return this.validateAndNormalizePlan(plan);
      } catch (error) {
        logger.error(`Error parsing plan JSON: ${(error as Error).message}`);
        logger.debug(`Raw plan response: ${planResponse}`);
        throw new Error(`Failed to parse development plan: ${(error as Error).message}`);
      }
    } catch (error) {
      logger.error(`Error creating plan: ${(error as Error).message}`);
      throw error;
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }
  
  /**
   * 計画立案用のツールを設定
   * @param task プロジェクトタスク
   */
  private setupPlanningTools(task: ProjectTask): void {
    // 計画立案に必要なファイルシステムツールを登録
    const planningTools = fileSystemTools.map(tool => {
      // ツールのexecute関数をラップして、projectIdを自動で追加
      const wrappedTool: ToolDefinition = {
        ...tool,
        execute: async (args: any) => {
          return await tool.execute({ ...args, projectId: task.id });
        }
      };
      return wrappedTool;
    });
    
    toolRegistry.registerTools(planningTools);
  }
  
  /**
   * 生成された計画を検証し、必要に応じて正規化する
   * @param plan 生成された開発計画
   */
  private validateAndNormalizePlan(plan: DevelopmentPlan): DevelopmentPlan {
    // 必須フィールドの存在チェック
    if (!plan.projectDescription) {
      plan.projectDescription = 'No description provided';
    }
    
    // technicalStackの初期化・正規化
    if (!plan.technicalStack) {
      plan.technicalStack = {};
    }
    
    // dependenciesの初期化・正規化
    if (!plan.dependencies) {
      plan.dependencies = { production: [], development: [] };
    } else {
      plan.dependencies.production = plan.dependencies.production || [];
      plan.dependencies.development = plan.dependencies.development || [];
    }
    
    // filesの初期化・正規化
    if (!plan.files || !Array.isArray(plan.files)) {
      plan.files = [];
    } else {
      // 各ファイルに必要なプロパティを設定
      plan.files = plan.files.map(file => ({
        ...file,
        status: file.status || 'pending'
      }));
    }
    
    // stepsの初期化・正規化
    if (!plan.steps || !Array.isArray(plan.steps)) {
      plan.steps = [];
    } else {
      // 各ステップに必要なプロパティを設定
      plan.steps = plan.steps.map(step => ({
        ...step,
        status: step.status || 'pending'
      }));
    }
    
    return plan;
  }
}