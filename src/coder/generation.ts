import path from 'path';
import fs from 'fs/promises';
import { FileInfo, ProjectTask, UserFeedback, DevelopmentPlan } from '../agent/types.js';
import { GeminiClient } from '../llm/geminiClient.js';
import { PromptBuilder } from '../llm/promptBuilder.js';
import logger from '../utils/logger.js';
import { toolRegistry } from '../llm/toolRegistry.js';
import { getProjectPath, listDirectory } from '../tools/fileSystem.js';

/**
 * コード生成・再生成・調整・README生成系ユーティリティ
 * 各関数は必要な依存を引数で受け取る
 */

// ファイル生成
export async function generateFile(
  geminiClient: GeminiClient,
  promptBuilder: PromptBuilder,
  task: ProjectTask,
  fileInfo: FileInfo,
  getCodingStandards: (task: ProjectTask) => string,
  gatherRelatedCode: (task: ProjectTask, fileInfo: FileInfo) => Promise<string>,
  setupCodingTools: (task: ProjectTask) => void,
  extractCodeFromResponse: (response: string, filePath: string) => string
): Promise<string> {
  logger.info(`Generating file: ${fileInfo.path} for project: ${task.id}`);

  try {
    setupCodingTools(task);
    const relatedCode = await gatherRelatedCode(task, fileInfo);

    const variables = {
      projectName: path.basename(task.projectPath ?? ''),
      projectDescription: task.plan?.projectDescription || '',
      filePath: fileInfo.path,
      fileDescription: fileInfo.description,
      relatedCode,
      codingStandards: getCodingStandards(task),
      currentTime: new Date().toISOString(),
    };

    const prompt = promptBuilder.buildCodePrompt(
      fileInfo.path,
      fileInfo.description,
      relatedCode,
      variables
    );
    const systemPrompt = promptBuilder.buildSystemPrompt(variables);

    logger.debug(`Sending code generation prompt for ${fileInfo.path} to Gemini API`);
    const codeResponse = await geminiClient.runToolConversation(prompt, systemPrompt);

    const code = extractCodeFromResponse(codeResponse, fileInfo.path);

    const projectPath = getProjectPath(task.id);
    const filePath = path.join(projectPath, fileInfo.path);

    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, code, 'utf-8');

    logger.debug(`Successfully generated file: ${fileInfo.path}`);
    return code;
  } catch (error) {
    logger.error(`Error generating file ${fileInfo.path}: ${(error as Error).message}`);
    throw error;
  } finally {
    toolRegistry.clearTools();
  }
}

// ファイル再生成
export async function regenerateFile(
  geminiClient: GeminiClient,
  promptBuilder: PromptBuilder,
  task: ProjectTask,
  fileInfo: FileInfo,
  existingContent: string,
  gatherRelatedCode: (task: ProjectTask, fileInfo: FileInfo) => Promise<string>,
  setupCodingTools: (task: ProjectTask) => void,
  extractCodeFromResponse: (response: string, filePath: string) => string
): Promise<string> {
  logger.info(`Regenerating file: ${fileInfo.path} for project: ${task.id}`);

  try {
    setupCodingTools(task);
    const relatedCode = await gatherRelatedCode(task, fileInfo);

    const variables = {
      projectName: path.basename(task.projectPath ?? ''),
      projectDescription: task.plan?.projectDescription || '',
      filePath: fileInfo.path,
      fileDescription: fileInfo.description,
      relatedCode,
      currentTime: new Date().toISOString(),
    };

    const feedbackContext = task.currentContextualFeedback && task.currentContextualFeedback.length > 0
      ? `最新のフィードバック:\n${task.currentContextualFeedback.join('\n')}`
      : '';

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

    const systemPrompt = promptBuilder.buildSystemPrompt(variables);

    logger.debug(`Sending code regeneration prompt for ${fileInfo.path} to Gemini API`);
    const codeResponse = await geminiClient.runToolConversation(prompt, systemPrompt);

    const newCode = extractCodeFromResponse(codeResponse, fileInfo.path);

    const projectPath = getProjectPath(task.id);
    const filePath = path.join(projectPath, fileInfo.path);

    await fs.writeFile(filePath, newCode, 'utf-8');

    logger.debug(`Successfully regenerated file: ${fileInfo.path}`);
    return newCode;
  } catch (error) {
    logger.error(`Error regenerating file ${fileInfo.path}: ${(error as Error).message}`);
    throw error;
  } finally {
    toolRegistry.clearTools();
  }
}

// フィードバックによるファイル調整
export async function adjustFileWithFeedback(
  geminiClient: GeminiClient,
  promptBuilder: PromptBuilder,
  task: ProjectTask,
  feedback: UserFeedback,
  setupCodingTools: (task: ProjectTask) => void,
  extractCodeFromResponse: (response: string, filePath: string) => string
): Promise<boolean> {
  logger.info(`Adjusting file: ${feedback.targetFile} based on feedback for project: ${task.id}`);

  try {
    if (!feedback.targetFile) {
      logger.error('No target file specified in feedback');
      return false;
    }

    setupCodingTools(task);

    const projectPath = getProjectPath(task.id);
    const filePath = path.join(projectPath, feedback.targetFile);

    let existingContent: string;
    try {
      existingContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      logger.error(`Could not read target file ${feedback.targetFile}: ${(error as Error).message}`);
      return false;
    }

    const variables = {
      projectName: path.basename(task.projectPath ?? ''),
      projectDescription: task.plan?.projectDescription || '',
      filePath: feedback.targetFile,
      currentTime: new Date().toISOString(),
    };

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

    const systemPrompt = promptBuilder.buildSystemPrompt(variables);

    logger.debug(`Sending code adjustment prompt for ${feedback.targetFile} to Gemini API`);
    const adjustedResponse = await geminiClient.runToolConversation(prompt, systemPrompt);

    const adjustedCode = extractCodeFromResponse(adjustedResponse, feedback.targetFile);

    await fs.writeFile(filePath, adjustedCode, 'utf-8');

    logger.debug(`Successfully adjusted file: ${feedback.targetFile}`);
    return true;
  } catch (error) {
    logger.error(`Error adjusting file: ${(error as Error).message}`);
    return false;
  } finally {
    toolRegistry.clearTools();
  }
}

// フィードバックによる機能追加
export async function addFeatureFromFeedback(
  geminiClient: GeminiClient,
  promptBuilder: PromptBuilder,
  task: ProjectTask,
  feedback: UserFeedback,
  setupCodingTools: (task: ProjectTask) => void
): Promise<boolean> {
  logger.info(`Adding feature based on feedback for project: ${task.id}`);

  try {
    setupCodingTools(task);

    const variables = {
      projectName: path.basename(task.projectPath ?? ''),
      projectDescription: task.plan?.projectDescription || '',
      currentTime: new Date().toISOString(),
    };

    const projectPath = getProjectPath(task.id);
    const allFiles = await listDirectory({ projectId: task.id, dirPath: '.' });
    const fileStructure = allFiles.join('\n');

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

    const systemPrompt = promptBuilder.buildSystemPrompt(variables);

    logger.debug(`Sending feature addition prompt to Gemini API`);
    const featureResponse = await geminiClient.runToolConversation(prompt, systemPrompt);

    logger.warn('Feature addition response parsing and application is not fully implemented yet.');
    logger.debug(`Feature addition response:\n${featureResponse}`);

    logger.info(`Successfully processed feature addition feedback (implementation pending)`);
    return true;
  } catch (error) {
    logger.error(`Error adding feature from feedback: ${(error as Error).message}`);
    return false;
  } finally {
    toolRegistry.clearTools();
  }
}

// README生成
export async function generateReadme(
  geminiClient: GeminiClient,
  promptBuilder: PromptBuilder,
  task: ProjectTask,
  setupCodingTools: (task: ProjectTask) => void
): Promise<void> {
  logger.info(`Generating README.md for project: ${task.id}`);

  try {
    setupCodingTools(task);

    const projectPath = getProjectPath(task.id);
    const readmePath = path.join(projectPath, 'README.md');

    const projectName = path.basename(projectPath);
    const projectDescription = task.plan?.projectDescription || 'No description provided.';
    const techStack = task.plan?.technicalStack ? Object.entries(task.plan.technicalStack)
      .map(([key, value]) => `- ${key}: ${(Array.isArray(value) ? value.join(', ') : value) || 'N/A'}`)
      .join('\n') : 'N/A';
    const dependencies = task.plan?.dependencies ?
      `Production:\n${task.plan.dependencies.production.map(d => `- ${d}`).join('\n') || '- N/A'}\n\nDevelopment:\n${task.plan.dependencies.development.map(d => `- ${d}`).join('\n') || '- N/A'}`
      : 'N/A';

    let fileList = 'N/A';
    try {
      const files = await fs.readdir(projectPath);
      fileList = files.filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== 'README.md' && f !== 'Plan.md')
        .map(f => `- ${f}`)
        .join('\n');
    } catch (listError) {
      logger.warn(`Could not list project directory: ${(listError as Error).message}`);
    }

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
    const systemPrompt = promptBuilder.buildSystemPrompt(variables);

    logger.debug(`Sending README generation prompt to Gemini API`);
    const readmeContent = await geminiClient.generateContent(prompt, systemPrompt);

    await fs.writeFile(readmePath, readmeContent.trim(), 'utf-8');
    logger.info(`Successfully generated README.md`);
  } catch (error) {
    logger.error(`Error generating README.md: ${(error as Error).message}`);
  } finally {
    toolRegistry.clearTools();
  }
}