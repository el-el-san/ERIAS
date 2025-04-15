import path from 'path';
import fs from 'fs/promises';
import { FileInfo, ProjectTask, Coder as CoderInterface, UserFeedback, DevelopmentPlan } from './types'; // DevelopmentPlan をインポート
import { GeminiClient } from '../llm/geminiClient';
import { PromptBuilder, PromptType } from '../llm/promptBuilder';
import logger from '../utils/logger';
import { toolRegistry, ToolDefinition } from '../llm/toolRegistry';
import { fileSystemTools, getProjectPath, listDirectory } from '../tools/fileSystem'; // listDirectory をインポート
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
          // 修正: string[] → string に型変換する問題を解決
          const result = await npmInstallTool.function(
            getProjectPath(task.id),
            task.plan.dependencies.production.join(' '),
            //false // isDevパラメータを明示的に指定
          );

          if (!result) {
            logger.error(`Failed to install production dependencies`);
            return false;
          }
        }
      }

      // 開発用依存関係をインストール
      if (task.plan.dependencies.development.length > 0) {
        logger.debug(`Installing development dependencies: ${task.plan.dependencies.development.join(', ')}`);
        const npmInstallTool = commandTools.find(tool => tool.name === 'npmInstall');

        if (npmInstallTool) {
          // 修正: string[] → string に型変換する問題を解決
          const result = await npmInstallTool.function(
            getProjectPath(task.id),
            task.plan.dependencies.development.join(' '),
            //true // isDevをtrueに設定
          );

          if (!result) {
            logger.error(`Failed to install development dependencies`);
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
        name: tool.name,
        description: `Tool for project ${task.id}: ${tool.name}`,
        parameters: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            filePath: { type: "string" },
            content: { type: "string" }
          },
          required: ["projectId"]
        },
        execute: async (args: any) => {
          // 型安全のために引数をキャスト
          if (tool.name === 'writeProjectFile') {
            // 必要な引数がすべて揃っていることを確認
            if (!args.filePath || args.content === undefined) {
              throw new Error(`Missing required parameter for writeProjectFile: filePath=${args.filePath}, content is defined=${args.content !== undefined}`);
            }
            return await (tool.function as any)(
              args.projectId ? getProjectPath(args.projectId) : getProjectPath(task.id),
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

  /**
   * フィードバックに基づいてファイルを再生成
   * @param task プロジェクトタスク
   * @param fileInfo 再生成するファイル情報
   * @param existingContent 既存の内容
   */
  public async regenerateFile(task: ProjectTask, fileInfo: FileInfo, existingContent: string): Promise<string> {
    logger.info(`Regenerating file: ${fileInfo.path} for project: ${task.id}`);

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
        currentTime: new Date().toISOString(),
      };

      // フィードバックがあればコンテキストに追加
      const feedbackContext = task.currentContextualFeedback && task.currentContextualFeedback.length > 0
        ? `最新のフィードバック:\n${task.currentContextualFeedback.join('\n')}`
        : '';

      // コード再生成用プロンプトを生成
      const prompt = `
      以下のファイルを再生成してください: ${fileInfo.path}

      元のファイルの説明: ${fileInfo.description}

      元のコード:
      \`\`\`
      ${existingContent}
      \`\`\`

      関連コード:
      ${relatedCode || 'なし'}

      ${feedbackContext}

      新しい実装を提供してください。コードブロックだけを出力してください。
      `;

      const systemPrompt = this.promptBuilder.buildSystemPrompt(variables);

      // Gemini APIでコードを再生成
      logger.debug(`Sending code regeneration prompt for ${fileInfo.path} to Gemini API`);
      const codeResponse = await this.geminiClient.runToolConversation(prompt, systemPrompt);

      // コードブロックを抽出
      const newCode = this.extractCodeFromResponse(codeResponse, fileInfo.path);

      // ファイルに保存
      const projectPath = getProjectPath(task.id);
      const filePath = path.join(projectPath, fileInfo.path);

      // ファイルに書き込み
      await fs.writeFile(filePath, newCode, 'utf-8');

      logger.debug(`Successfully regenerated file: ${fileInfo.path}`);
      return newCode;
    } catch (error) {
      logger.error(`Error regenerating file ${fileInfo.path}: ${(error as Error).message}`);
      throw error;
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }

  /**
   * フィードバックに基づいてファイルを調整
   * @param task プロジェクトタスク
   * @param feedback フィードバック
   */
  public async adjustFileWithFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean> {
    logger.info(`Adjusting file: ${feedback.targetFile} based on feedback for project: ${task.id}`);

    try {
      if (!feedback.targetFile) {
        logger.error('No target file specified in feedback');
        return false;
      }

      // コード生成用のツールを登録
      this.setupCodingTools(task);

      // ファイルが存在するか確認
      const projectPath = getProjectPath(task.id);
      const filePath = path.join(projectPath, feedback.targetFile);

      let existingContent: string;
      try {
        existingContent = await fs.readFile(filePath, 'utf-8');
      } catch (error) {
        logger.error(`Could not read target file ${feedback.targetFile}: ${(error as Error).message}`);
        return false;
      }

      // プロンプト変数を準備
      const variables = {
        projectName: path.basename(task.projectPath),
        projectDescription: task.plan?.projectDescription || '',
        filePath: feedback.targetFile,
        currentTime: new Date().toISOString(),
      };

      // コード調整用プロンプトを生成
      const prompt = `
      以下のファイルを調整してください: ${feedback.targetFile}

      現在のコード:
      \`\`\`
      ${existingContent}
      \`\`\`

      ユーザーフィードバック:
      ${feedback.content}

      調整後のコードを提供してください。コードブロックだけを出力してください。
      `;

      const systemPrompt = this.promptBuilder.buildSystemPrompt(variables);

      // Gemini APIでコードを調整
      logger.debug(`Sending code adjustment prompt for ${feedback.targetFile} to Gemini API`);
      const adjustedResponse = await this.geminiClient.runToolConversation(prompt, systemPrompt);

      // コードブロックを抽出
      const adjustedCode = this.extractCodeFromResponse(adjustedResponse, feedback.targetFile);

      // ファイルに保存
      await fs.writeFile(filePath, adjustedCode, 'utf-8');

      logger.debug(`Successfully adjusted file: ${feedback.targetFile}`);
      return true;
    } catch (error) {
      logger.error(`Error adjusting file: ${(error as Error).message}`);
      return false;
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }

  /**
   * フィードバックに基づいて機能を追加
   * @param task プロジェクトタスク
   * @param feedback フィードバック
   */
  public async addFeatureFromFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean> {
    logger.info(`Adding feature based on feedback for project: ${task.id}`);

    try {
      // コード生成用のツールを登録
      this.setupCodingTools(task);

      // プロンプト変数を準備
      const variables = {
        projectName: path.basename(task.projectPath),
        projectDescription: task.plan?.projectDescription || '',
        currentTime: new Date().toISOString(),
      };

      // プロジェクト全体のファイル構造を取得
      const projectPath = getProjectPath(task.id);
      const allFiles = await listDirectory({ projectId: task.id, dirPath: '.' }); // listDirectory を使用
      const fileStructure = allFiles.join('\n');

      // 機能追加用プロンプトを生成
      const prompt = `
      現在のプロジェクトに新しい機能を追加してください。

      プロジェクト名: ${variables.projectName}
      プロジェクト概要: ${variables.projectDescription}

      ユーザーからの機能追加要求:
      ${feedback.content}

      現在のファイル構造:
      ${fileStructure}

      必要なファイルの変更または新規作成を行ってください。
      変更が必要なファイルについては、ファイルパスと変更後のコードを提供してください。
      新規作成が必要なファイルについては、ファイルパスとコードを提供してください。
      コードはコードブロックで囲んでください。
      `;

      const systemPrompt = this.promptBuilder.buildSystemPrompt(variables);

      // Gemini APIで機能追加のコードを生成
      logger.debug(`Sending feature addition prompt to Gemini API`);
      const featureResponse = await this.geminiClient.runToolConversation(prompt, systemPrompt);

      // レスポンスからファイル変更/作成情報を抽出して適用
      // (この部分は複雑になるため、別途パーサーや処理ロジックが必要)
      // 例: レスポンスを解析し、writeProjectFileツールを複数回呼び出す
      logger.warn('Feature addition response parsing and application is not fully implemented yet.');
      // 仮実装: ログにレスポンスを出力
      logger.debug(`Feature addition response:\n${featureResponse}`);

      // 実際にはレスポンスを解析し、ファイル操作を行う必要がある
      // const changes = parseFeatureResponse(featureResponse);
      // for (const change of changes) {
      //   await writeProjectFile(projectPath, change.path, change.content);
      // }

      logger.info(`Successfully processed feature addition feedback (implementation pending)`);
      return true; // 仮に成功とする
    } catch (error) {
      logger.error(`Error adding feature from feedback: ${(error as Error).message}`);
      return false;
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }

  // --- ここから追加 ---
  /**
   * プロジェクトのREADME.mdを生成する
   * @param task プロジェクトタスク
   */
  public async generateReadme(task: ProjectTask): Promise<void> {
    logger.info(`Generating README.md for project: ${task.id}`);

    try {
      // コード生成用のツールを登録 (ファイル読み書きのため)
      this.setupCodingTools(task);

      const projectPath = getProjectPath(task.id);
      const readmePath = path.join(projectPath, 'README.md');

      // プロジェクト情報を収集
      const projectName = path.basename(projectPath);
      const projectDescription = task.plan?.projectDescription || 'No description provided.';
      const techStack = task.plan?.technicalStack ? Object.entries(task.plan.technicalStack)
        .map(([key, value]) => `- ${key}: ${(Array.isArray(value) ? value.join(', ') : value) || 'N/A'}`)
        .join('\n') : 'N/A';
      const dependencies = task.plan?.dependencies ?
        `Production:\n${task.plan.dependencies.production.map(d => `- ${d}`).join('\n') || '- N/A'}\n\nDevelopment:\n${task.plan.dependencies.development.map(d => `- ${d}`).join('\n') || '- N/A'}`
        : 'N/A';

      // ファイルリストを取得 (ルートのみ、シンプルなリスト)
      let fileList = 'N/A';
      try {
        const files = await fs.readdir(projectPath);
        fileList = files.filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== 'README.md' && f !== 'Plan.md') // 除外リスト
                      .map(f => `- ${f}`)
                      .join('\n');
      } catch (listError) {
        logger.warn(`Could not list project directory: ${(listError as Error).message}`);
      }


      // README生成用プロンプトを生成
      const prompt = `
      以下の情報に基づいて、プロジェクト「${projectName}」のREADME.mdファイルを作成してください。
      Markdown形式で、インストール方法、使い方、主な機能などを簡潔に記述してください。

      プロジェクト概要:
      ${projectDescription}

      技術スタック:
      ${techStack}

      依存関係:
      ${dependencies}

      主なファイル/ディレクトリ構成:
      ${fileList}

      README.mdの内容だけを出力してください。
      `;

      const variables = { projectName, projectDescription, currentTime: new Date().toISOString() };
      const systemPrompt = this.promptBuilder.buildSystemPrompt(variables);

      // Gemini APIでREADMEの内容を生成
      logger.debug(`Sending README generation prompt to Gemini API`);
      // generateText -> generateContent に修正
      const readmeContent = await this.geminiClient.generateContent(prompt, systemPrompt);

      // 生成された内容をファイルに保存
      await fs.writeFile(readmePath, readmeContent.trim(), 'utf-8');
      logger.info(`Successfully generated README.md`);

    } catch (error) {
      logger.error(`Error generating README.md: ${(error as Error).message}`);
      // README生成エラーは致命的ではない場合があるため、ここではエラーを投げない
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }
  // --- ここまで追加 ---
}