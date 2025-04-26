import path from 'path';
import fs from 'fs/promises';
import { ProjectTask, FileInfo } from '../agent/types.js';
import logger from '../utils/logger.js';
import { toolRegistry, ToolDefinition } from '../llm/toolRegistry.js';
import { fileSystemTools, getProjectPath } from '../tools/fileSystem.js';
import { commandTools } from '../tools/commandExecutor.js';

/**
 * ツールセットアップ・ファイル操作・規約系ユーティリティ
 */

// コーディング用ツールをセットアップ
export function setupCodingTools(task: ProjectTask): void {
  const codingTools = [
    ...fileSystemTools,
    ...commandTools
  ].map(tool => {
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
        if (tool.name === 'writeProjectFile') {
          if (!args.filePath || args.content === undefined) {
            throw new Error(`Missing required parameter for writeProjectFile: filePath=${args.filePath}, content is defined=${args.content !== undefined}`);
          }
          return await (tool.function as any)(
            args.projectId ? getProjectPath(args.projectId) : getProjectPath(task.id),
            args.filePath,
            args.content
          );
        } else if (tool.name === 'readProjectFile') {
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
          return await (tool.function as any)(args);
        }
      }
    };
    return wrappedTool;
  });

  toolRegistry.registerTools(codingTools);
}

// ファイル依存コードを収集
export async function gatherRelatedCode(task: ProjectTask, fileInfo: FileInfo): Promise<string> {
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
    }
  }

  return relatedCodeParts.join('\n// ----------------\n');
}

// コーディング規約を取得
export function getCodingStandards(task: ProjectTask): string {
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

// LLMレスポンスからコードを抽出
export function extractCodeFromResponse(response: string, filePath: string): string {
  const codeBlockRegex = /```(?:[a-zA-Z]+)?(\n|\r\n|\r)([\s\S]*?)```/g;
  const matches = [...response.matchAll(codeBlockRegex)];

  if (matches.length > 0) {
    return matches[0][2].trim();
  }
  return response.trim();
}