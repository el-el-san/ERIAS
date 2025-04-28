import path from 'path';
import fs from 'fs/promises'; // fs/promises を使う
import { DevelopmentPlan, ProjectTask, Planner as PlannerInterface, FileInfo } from './types.js'; // FileInfo をインポート
import { GeminiClient } from '../llm/geminiClient.js';
import { PromptBuilder, PromptType } from '../llm/promptBuilder.js';
import logger from '../utils/logger.js';
import { toolRegistry, ToolDefinition } from '../llm/toolRegistry.js';
import { fileSystemTools, getProjectPath } from '../tools/fileSystem.js'; // getProjectPath をインポート
import { safeJsonParse } from '../utils/jsonUtils.js'; // 追加

/**
 * 指定した文字列から「//」で始まるコメント行を除去する
 * @param input コメント付きJSON文字列
 * @returns コメント行除去済み文字列
 */
function removeJsonLineComments(input: string): string {
  return input
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
}

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
      let plan: DevelopmentPlan; // plan 変数を try ブロックの外で宣言
      try {
        // レスポンスがJSON形式になっているかチェック
        if (!planResponse.trim().startsWith('{') && !planResponse.trim().startsWith('[')) {
          // JSON形式でない場合、JSONブロックを抽出
          const jsonMatch = planResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            plan = safeJsonParse<DevelopmentPlan>(removeJsonLineComments(jsonMatch[1])); // コメント行除去を追加
          } else { // else を追加してエラー処理を明確化
            throw new Error('Failed to extract valid JSON from the response');
          }
        } else { // else を追加
          // 直接JSONをパース
          plan = safeJsonParse<DevelopmentPlan>(removeJsonLineComments(planResponse)); // コメント行除去を追加
        }

       // ここで plan が確定しているはず
       const validatedPlan = this.validateAndNormalizePlan(plan);

       // --- ここから追加 ---
       // Plan.md を生成して保存
       try {
         const planMarkdown = this._generatePlanMarkdown(validatedPlan); // メソッド呼び出しに変更
         const planFilePath = path.join(task.projectPath, 'Plan.md'); // task.projectPath を使用
         await fs.writeFile(planFilePath, planMarkdown);
         logger.info(`Plan saved to ${planFilePath}`);
       } catch (writeError) {
         logger.error(`Failed to write Plan.md: ${(writeError as Error).message}`);
         // Plan.md の書き込み失敗は致命的ではないため、エラーをログに記録するだけにする
       }
       // --- ここまで追加 ---

       return validatedPlan; // 検証済みプランを返す

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
        name: tool.name,
        description: `Planning tool for project ${task.id}: ${tool.name}`,
        parameters: {
          type: "object",
          properties: {
            projectPath: { type: "string" },
            filePath: { type: "string" },
            content: { type: "string" }
          },
          required: ["projectPath"]
        },
        execute: async (args: any) => {
          if (tool.name === 'writeProjectFile') {
            // 必要な引数がすべて揃っていることを確認
            if (!args.filePath || args.content === undefined) {
              throw new Error(`Missing required parameter for writeProjectFile: filePath=${args.filePath}, content is defined=${args.content !== undefined}`);
            }
            // 修正: 適切に引数を渡す
            return await (tool.function as any)(
              args.projectPath || getProjectPath(task.id),
              args.filePath,
              args.content
            );
          } else {
            if (tool.name === 'readProjectFile') {
              if (!args.filePath) {
                throw new Error('Missing required parameter: filePath');
              }
              return await (tool.function as any)({
                projectId: args.projectId || task.id,
                filePath: args.filePath
              });
            } else if (tool.name === 'listDirectory') {
              return await (tool.function as any)({
                projectId: args.projectId || task.id,
                dirPath: args.dirPath
              });
            } else if (tool.name === 'exists') {
              if (!args.itemPath) {
                throw new Error('Missing required parameter: itemPath');
              }
              return await (tool.function as any)({
                projectId: args.projectId || task.id,
                itemPath: args.itemPath
              });
            } else {
              // その他の関数の場合は引数をそのまま渡す
              return await (tool.function as any)(args);
            }
          }
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

  /**
   * フィードバックに基づいて計画を調整
   * @param task プロジェクトタスク
   * @param feedback フィードバック
   */
  public async adjustPlan(task: ProjectTask, feedback: string): Promise<DevelopmentPlan> {
    logger.info(`Adjusting plan for project: ${task.id} based on feedback`);

    try {
      // 計画立案用のツールを登録
      this.setupPlanningTools(task);

      // プロンプト変数を準備
      const variables = {
        projectName: path.basename(task.projectPath),
        specification: task.specification,
        currentTime: new Date().toISOString(),
      };

      // 計画調整用プロンプトを生成
      const currentPlan = JSON.stringify(task.plan, null, 2);
      const prompt = `現在の計画: ${currentPlan}\n\nユーザーフィードバック: ${feedback}\n\n上記のフィードバックに基づいて計画を調整してください。`;
      const systemPrompt = this.promptBuilder.buildSystemPrompt(variables);

      // Gemini APIで計画調整を生成
      logger.debug('Sending plan adjustment prompt to Gemini API');
      const adjustmentResponse = await this.geminiClient.runToolConversation(prompt, systemPrompt);

      // レスポンスをパース
      try {
        // JSONブロックを抽出
        const jsonMatch = adjustmentResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          const adjustedPlan = safeJsonParse<DevelopmentPlan>(removeJsonLineComments(jsonMatch[1])); // コメント行除去を追加
          return this.validateAndNormalizePlan(adjustedPlan);
        }

        // 直接JSONをパース
        if (adjustmentResponse.trim().startsWith('{')) {
          const adjustedPlan = safeJsonParse<DevelopmentPlan>(removeJsonLineComments(adjustmentResponse)); // コメント行除去を追加
          return this.validateAndNormalizePlan(adjustedPlan);
        }

        throw new Error('Failed to extract valid JSON from the response');
      } catch (error) {
        logger.error(`Error parsing adjusted plan JSON: ${(error as Error).message}`);
        logger.debug(`Raw adjustment response: ${adjustmentResponse}`);
        throw new Error(`Failed to parse adjusted development plan: ${(error as Error).message}`);
      }
    } catch (error) {
      logger.error(`Error adjusting plan: ${(error as Error).message}`);
      throw error;
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }

  /**
   * フィードバックに基づいて計画を再構築
   * @param task プロジェクトタスク
   * @param processingPrompt 処理用プロンプト
   */
  public async refactorPlan(task: ProjectTask, processingPrompt: string): Promise<DevelopmentPlan> {
    logger.info(`Refactoring plan for project: ${task.id}`);

    try {
      // 計画立案用のツールを登録
      this.setupPlanningTools(task);

      // プロンプト変数を準備
      const variables = {
        projectName: path.basename(task.projectPath),
        specification: task.specification,
        currentTime: new Date().toISOString(),
      };

      // 計画再構築用のプロンプトを生成
      const currentPlan = task.plan ? JSON.stringify(task.plan, null, 2) : '{}';
      const prompt = `現在の計画: ${currentPlan}\n\n${processingPrompt}\n\n上記の指示に基づいて計画を再構築してください。`;
      const systemPrompt = this.promptBuilder.buildSystemPrompt(variables);

      // Gemini APIで計画再構築を生成
      logger.debug('Sending plan refactoring prompt to Gemini API');
      const refactoringResponse = await this.geminiClient.runToolConversation(prompt, systemPrompt);

      // レスポンスをパース
      try {
        // JSONブロックを抽出
        const jsonMatch = refactoringResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          const refactoredPlan = safeJsonParse<DevelopmentPlan>(removeJsonLineComments(jsonMatch[1])); // コメント行除去を追加
          return this.validateAndNormalizePlan(refactoredPlan);
        }

        // 直接JSONをパース
        if (refactoringResponse.trim().startsWith('{')) {
          const refactoredPlan = safeJsonParse<DevelopmentPlan>(removeJsonLineComments(refactoringResponse)); // コメント行除去を追加
          return this.validateAndNormalizePlan(refactoredPlan);
        }

        throw new Error('Failed to extract valid JSON from the response');
      } catch (error) {
        logger.error(`Error parsing refactored plan JSON: ${(error as Error).message}`);
        logger.debug(`Raw refactoring response: ${refactoringResponse}`);
        throw new Error(`Failed to parse refactored development plan: ${(error as Error).message}`);
      }
    } catch (error) {
      logger.error(`Error refactoring plan: ${(error as Error).message}`);
      throw error;
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }

  // --- ここから追加 ---
  /**
   * DevelopmentPlanオブジェクトをMarkdown形式の文字列に変換する
   * @param plan 開発計画オブジェクト
   * @returns Markdown形式の文字列
   */
  private _generatePlanMarkdown(plan: DevelopmentPlan): string {
    let markdown = `# Project Plan\n\n`;

    markdown += `## Project Description\n`;
    markdown += `${plan.projectDescription || 'N/A'}\n\n`;

    markdown += `## Technical Stack\n`;
    if (plan.technicalStack && Object.keys(plan.technicalStack).length > 0) {
      for (const [key, value] of Object.entries(plan.technicalStack)) {
        // 配列の場合はカンマ区切りで表示
        const displayValue = Array.isArray(value) ? value.join(', ') : value;
        markdown += `- **${key}:** ${displayValue || 'N/A'}\n`;
      }
    } else {
      markdown += `N/A\n`;
    }
    markdown += `\n`;

    markdown += `## Dependencies\n`;
    markdown += `### Production\n`;
    if (plan.dependencies?.production && plan.dependencies.production.length > 0) {
      plan.dependencies.production.forEach(dep => markdown += `- ${dep}\n`);
    } else {
      markdown += `N/A\n`;
    }
    markdown += `### Development\n`;
    if (plan.dependencies?.development && plan.dependencies.development.length > 0) {
      plan.dependencies.development.forEach(dep => markdown += `- ${dep}\n`);
    } else {
      markdown += `N/A\n`;
    }
    markdown += `\n`;

    markdown += `## Files to be Created/Modified\n`;
    if (plan.files && plan.files.length > 0) {
      plan.files.forEach(file => {
        markdown += `- **${file.path}**\n`;
        markdown += `  - Description: ${file.description || 'N/A'}\n`; // purpose -> description に修正
        // markdown += `  - Status: ${file.status || 'pending'}\n`; // ステータスは実行時に変わるので含めない方が良いかも
      });
    } else {
      markdown += `N/A\n`;
    }
    markdown += `\n`;

    markdown += `## Development Steps\n`;
    if (plan.steps && plan.steps.length > 0) {
      plan.steps.forEach((step, index) => {
        markdown += `${index + 1}. **${step.description}**\n`; // details の参照を削除
        // markdown += `   - Status: ${step.status || 'pending'}\n`; // ステータスは実行時に変わるので含めない方が良いかも
      });
    } else {
      markdown += `N/A\n`;
    }
    markdown += `\n`;

    return markdown;
  }
  // --- ここまで追加 ---
}
