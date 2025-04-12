import path from 'path';
import fs from 'fs/promises';
import { FileInfo, ProjectTask, Coder as CoderInterface } from './types';
import { GeminiClient } from '../llm/geminiClient';
import { PromptBuilder, PromptType } from '../llm/promptBuilder';
import logger from '../utils/logger';
import { toolRegistry, ToolDefinition } from '../llm/toolRegistry';
import { fileSystemTools, getProjectPath } from '../tools/fileSystem';
import { commandTools } from '../tools/commandExecutor';
import { withRetry } from '../utils/asyncUtils';

/**
 * コード生成モジュール
 * 計画に基づいてコードを生成する
 */
export class Coder implements CoderInterface {
  private geminiClient: GeminiClient;
  private promptBuilder: PromptBuilder;
  
  /**
   * Coderを初期化
   * @param geminiClient Gemini APIクライアント
   * @param promptBuilder プロンプトビルダー
   */
  constructor(geminiClient: GeminiClient, promptBuilder: PromptBuilder) {
    this.geminiClient = geminiClient;
    this.promptBuilder = promptBuilder;
  }
  
  /**
   * ファイルを生成する
   * @param task プロジェクトタスク
   * @param fileInfo 生成するファイル情報
   */
  public async generateFile(task: ProjectTask, fileInfo: FileInfo): Promise<string> {
    logger.info(`Generating file: ${fileInfo.path} for project: ${task.id}`);
    
    try {
      // コード生成用のツールを登録
      this.setupCodingTools(task);
      
      // 関連コードが必要な場合は取得
      const relatedCode = await this.gatherRelatedCode(task, fileInfo);
      
      // プロンプト変数を準備
      const variables = {
        projectName: path.basename(task.projectPath),
        projectDescription: task.plan?.projectDescription || '',
        filePath: fileInfo.path,
        fileDescription: fileInfo.description,
        relatedCode,
        codingStandards: this.getCodingStandards(task),
        currentTime: new Date().toISOString(),
      };
      
      // コード生成用プロンプトを生成
      const prompt = this.promptBuilder.buildCodePrompt(
        fileInfo.path,
        fileInfo.description,
        relatedCode,
        variables
      );
      const systemPrompt = this.promptBuilder.buildSystemPrompt(variables);
      
      // Gemini API（Function Calling）でコードを生成
      logger.debug(`Sending code generation prompt for ${fileInfo.path} to Gemini API`);
      const codeResponse = await this.geminiClient.runToolConversation(prompt, systemPrompt);
      
      // コードブロックを抽出
      const code = this.extractCodeFromResponse(codeResponse, fileInfo.path);
      
      // ファイルに保存
      const projectPath = getProjectPath(task.id);
      const filePath = path.join(projectPath, fileInfo.path);
      
      // ディレクトリがなければ作成
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      
      // ファイルに書き込み
      await fs.writeFile(filePath, code, 'utf-8');
      
      logger.debug(`Successfully generated file: ${fileInfo.path}`);
      return code;
    } catch (error) {
      logger.error(`Error generating file ${fileInfo.path}: ${(error as Error).message}`);
      throw error;
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }
  
  /**
   * 依存関係をインストールする
   * @param task プロジェクトタスク
   */
  public async installDependencies(task: ProjectTask): Promise<boolean> {
    logger.info(`Installing dependencies for project: ${task.id}`);
    
    if (!task.plan?.dependencies) {
      logger.warn('No dependencies defined in plan');
      return false;
    }
    
    try {
      // コマンド実行用のツールを登録
      this.setupCodingTools(task);
      
      const projectPath = getProjectPath(task.id);
      
      // package.jsonが存在するか確認
      const packageJsonPath = path.join(projectPath, 'package.json');
      let packageJsonExists = false;
      
      try {
        await fs.access(packageJsonPath);
        packageJsonExists = true;
      } catch {
        // package.jsonが存在しない場合
        packageJsonExists = false;
      }
      
      if (!packageJsonExists) {
        // package.jsonを作成
        logger.debug('Creating package.json');
        const projectName = path.basename(projectPath).replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        
        const packageJson = {
          name: projectName,
          version: '0.1.0',
          description: task.plan?.projectDescription || 'Generated project',
          main: 'index.js',
          scripts: {
            test: 'echo "Error: no test specified" && exit 1'
          },
          keywords: [],
          author: '',
          license: 'ISC',
          dependencies: {},
          devDependencies: {}
        };
        
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
      }
      
      // 本番用依存関係をインストール
      if (task.plan.dependencies.production.length > 0) {
        logger.debug(`Installing production dependencies: ${task.plan.dependencies.production.join(', ')}`);
        const npmInstallTool = commandTools.find(tool => tool.name === 'npmInstall');
        
        if (npmInstallTool) {
          const result = await npmInstallTool.execute({
            projectId: task.id,
            packages: task.plan.dependencies.production,
            dev: false,
            timeout: 300000, // 5分
          });
          
          if (!result.success) {
            logger.error(`Failed to install production dependencies: ${result.output}`);
            return false;
          }
        }
      }
      
      // 開発用依存関係をインストール
      if (task.plan.dependencies.development.length > 0) {
        logger.debug(`Installing development dependencies: ${task.plan.dependencies.development.join(', ')}`);
        const npmInstallTool = commandTools.find(tool => tool.name === 'npmInstall');
        
        if (npmInstallTool) {
          const result = await npmInstallTool.execute({
            projectId: task.id,
            packages: task.plan.dependencies.development,
            dev: true,
            timeout: 300000, // 5分
          });
          
          if (!result.success) {
            logger.error(`Failed to install development dependencies: ${result.output}`);
            return false;
          }
        }
      }
      
      logger.info('Successfully installed all dependencies');
      return true;
    } catch (error) {
      logger.error(`Error installing dependencies: ${(error as Error).message}`);
      return false;
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }
  
  /**
   * コード生成に必要なツールを設定
   * @param task プロジェクトタスク
   */
  private setupCodingTools(task: ProjectTask): void {
    // ファイルシステムツールとコマンド実行ツールを登録
    const codingTools = [
      ...fileSystemTools,
      ...commandTools
    ].map(tool => {
      // ツールのexecute関数をラップして、projectIdを自動で追加
      const wrappedTool: ToolDefinition = {
        ...tool,
        execute: async (args: any) => {
          return await tool.execute({ ...args, projectId: task.id });
        }
      };
      return wrappedTool;
    });
    
    toolRegistry.registerTools(codingTools);
  }
  
  /**
   * 生成するファイルに関連するコードを収集
   * @param task プロジェクトタスク
   * @param fileInfo 生成するファイル情報
   */
  private async gatherRelatedCode(task: ProjectTask, fileInfo: FileInfo): Promise<string> {
    if (!fileInfo.dependencies || fileInfo.dependencies.length === 0) {
      return '';
    }
    
    logger.debug(`Gathering related code for ${fileInfo.path}`);
    const projectPath = getProjectPath(task.id);
    const relatedCodeParts: string[] = [];
    
    for (const dependencyPath of fileInfo.dependencies) {
      try {
        const fullPath = path.join(projectPath, dependencyPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        relatedCodeParts.push(`// File: ${dependencyPath}\n${content}\n`);
      } catch (error) {
        logger.warn(`Could not read dependency file ${dependencyPath}: ${(error as Error).message}`);
        // 不足しているファイルがあってもエラーにはしない
      }
    }
    
    return relatedCodeParts.join('\n// ----------------\n');
  }
  
  /**
   * コーディング規約を取得
   * @param task プロジェクトタスク
   */
  private getCodingStandards(task: ProjectTask): string {
    // 基本的なコーディング規約
    return `
    - 変数名と関数名はcamelCaseで記述する
    - クラス名とインターフェース名はPascalCaseで記述する
    - ソースコードを適切にコメントする
    - インデントは2スペースまたは4スペースで統一する
    - 暗黙的なany型は避ける
    - 純粋関数を可能な限り使用する
    - 親切でわかりやすいエラーメッセージを表示する
    - 安全なパス解決や入力バリデーションを実装する
    `;    
  }
  
  /**
   * レスポンスからコードを抽出
   * @param response LLMのレスポンス
   * @param filePath ファイルパス
   */
  private extractCodeFromResponse(response: string, filePath: string): string {
    // コードブロックが含まれているかチェック
    const codeBlockRegex = /```(?:[a-zA-Z]+)?(\n|\r\n|\r)([\s\S]*?)```/g;
    const matches = [...response.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
      // 最初のコードブロックを取得
      return matches[0][2].trim();
    }
    
    // コードブロックがない場合は、レスポンス全体をコードとみなす
    return response.trim();
  }
}