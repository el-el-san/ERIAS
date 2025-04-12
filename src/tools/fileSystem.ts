import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import logger from '../utils/logger';
import config from '../config/config';
import { ToolDefinition } from '../llm/toolRegistry';

// fsのPromiseベースAPIを作成
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

/**
 * 安全なパス解決
 * プロジェクトディレクトリ外へのアクセスを防止
 * @param basePath 基準パス (プロジェクトディレクトリ)
 * @param targetPath 対象パス
 * @returns 安全に解決されたパス
 */
export const resolveSafePath = (basePath: string, targetPath: string): string => {
  // 絶対パスを正規化
  const normalizedBase = path.normalize(path.resolve(basePath));
  
  // ターゲットパスを結合し正規化
  const resolvedPath = path.normalize(path.resolve(normalizedBase, targetPath));
  
  // ターゲットパスが基準パス配下にあることを確認
  if (!resolvedPath.startsWith(normalizedBase)) {
    throw new Error(`Security violation: Attempted to access path outside of allowed directory: ${targetPath}`);
  }
  
  return resolvedPath;
};

/**
 * プロジェクト作業ディレクトリのパスを生成
 * @param projectId プロジェクトID
 */
export const getProjectPath = (projectId: string): string => {
  return path.join(config.agent.projectsDir, projectId);
};

/**
 * ファイル読み込みツール
 * @param path ファイルパス（プロジェクトディレクトリからの相対パス）
 * @param projectId プロジェクトID
 */
export const readFileTool: ToolDefinition = {
  name: 'readFile',
  description: 'Read content from a file',
  parameters: {
    type: 'object',
    required: ['path'],
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to project directory',
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf-8)',
        enum: ['utf-8', 'utf8', 'ascii', 'binary', 'base64', 'hex'],
      },
    },
  },
  execute: async (args: { path: string; encoding?: string; projectId: string }): Promise<{ content: string }> => {
    try {
      const projectPath = getProjectPath(args.projectId);
      const resolvedPath = resolveSafePath(projectPath, args.path);
      
      logger.debug(`Reading file: ${resolvedPath}`);
      
      const content = await readFileAsync(resolvedPath, { encoding: args.encoding as BufferEncoding || 'utf-8' });
      return { content: content.toString() };
    } catch (error) {
      logger.error(`Error reading file: ${args.path} - ${(error as Error).message}`);
      throw new Error(`Failed to read file: ${args.path} - ${(error as Error).message}`);
    }
  },
};

/**
 * ファイル書き込みツール
 * @param path ファイルパス（プロジェクトディレクトリからの相対パス）
 * @param content 書き込む内容
 * @param projectId プロジェクトID
 */
export const writeFileTool: ToolDefinition = {
  name: 'writeFile',
  description: 'Write content to a file, creating directories if needed',
  parameters: {
    type: 'object',
    required: ['path', 'content'],
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to project directory',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf-8)',
        enum: ['utf-8', 'utf8', 'ascii', 'binary', 'base64', 'hex'],
      },
    },
  },
  execute: async (args: { path: string; content: string; encoding?: string; projectId: string }): Promise<{ success: boolean; path: string }> => {
    try {
      const projectPath = getProjectPath(args.projectId);
      const resolvedPath = resolveSafePath(projectPath, args.path);
      
      // ディレクトリが存在しない場合は再帰的に作成
      const dirPath = path.dirname(resolvedPath);
      if (!fs.existsSync(dirPath)) {
        await mkdirAsync(dirPath, { recursive: true });
      }
      
      logger.debug(`Writing file: ${resolvedPath}`);
      
      await writeFileAsync(resolvedPath, args.content, { encoding: args.encoding as BufferEncoding || 'utf-8' });
      return { success: true, path: args.path };
    } catch (error) {
      logger.error(`Error writing file: ${args.path} - ${(error as Error).message}`);
      throw new Error(`Failed to write file: ${args.path} - ${(error as Error).message}`);
    }
  },
};

/**
 * ディレクトリ内のファイル一覧を取得するツール
 * @param path ディレクトリパス（プロジェクトディレクトリからの相対パス）
 * @param projectId プロジェクトID
 */
export const listFilesTool: ToolDefinition = {
  name: 'listFiles',
  description: 'List files in a directory',
  parameters: {
    type: 'object',
    required: ['path'],
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to project directory',
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to list files recursively (default: false)',
      },
    },
  },
  execute: async (args: { path: string; recursive?: boolean; projectId: string }): Promise<{ files: string[] }> => {
    try {
      const projectPath = getProjectPath(args.projectId);
      const resolvedPath = resolveSafePath(projectPath, args.path);
      
      logger.debug(`Listing files in directory: ${resolvedPath}`);
      
      if (!(await statAsync(resolvedPath)).isDirectory()) {
        throw new Error(`Not a directory: ${args.path}`);
      }
      
      if (args.recursive) {
        // 再帰的にファイル一覧を取得
        const files: string[] = [];
        const walkDir = async (dir: string, basePath: string) => {
          const entries = await readdirAsync(dir);
          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const relativePath = path.join(basePath, entry);
            const stat = await statAsync(fullPath);
            
            if (stat.isDirectory()) {
              await walkDir(fullPath, relativePath);
            } else {
              files.push(relativePath);
            }
          }
        };
        
        await walkDir(resolvedPath, '');
        return { files };
      } else {
        // 非再帰的に直接のファイル一覧のみを取得
        const entries = await readdirAsync(resolvedPath);
        const files = await Promise.all(
          entries.map(async (entry) => {
            const entryPath = path.join(resolvedPath, entry);
            const stat = await statAsync(entryPath);
            return { name: entry, isDirectory: stat.isDirectory() };
          })
        );
        
        return {
          files: files.map(f => `${f.name}${f.isDirectory ? '/' : ''}`),
        };
      }
    } catch (error) {
      logger.error(`Error listing files: ${args.path} - ${(error as Error).message}`);
      throw new Error(`Failed to list files: ${args.path} - ${(error as Error).message}`);
    }
  },
};

/**
 * ディレクトリを作成するツール
 * @param path ディレクトリパス（プロジェクトディレクトリからの相対パス）
 * @param projectId プロジェクトID
 */
export const mkdirTool: ToolDefinition = {
  name: 'mkdir',
  description: 'Create a directory',
  parameters: {
    type: 'object',
    required: ['path'],
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to project directory',
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to create parent directories as needed (default: true)',
      },
    },
  },
  execute: async (args: { path: string; recursive?: boolean; projectId: string }): Promise<{ success: boolean; path: string }> => {
    try {
      const projectPath = getProjectPath(args.projectId);
      const resolvedPath = resolveSafePath(projectPath, args.path);
      
      logger.debug(`Creating directory: ${resolvedPath}`);
      
      const recursive = args.recursive !== false; // デフォルトはtrue
      await mkdirAsync(resolvedPath, { recursive });
      
      return { success: true, path: args.path };
    } catch (error) {
      logger.error(`Error creating directory: ${args.path} - ${(error as Error).message}`);
      throw new Error(`Failed to create directory: ${args.path} - ${(error as Error).message}`);
    }
  },
};

// ファイル操作ツール一覧
export const fileSystemTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  mkdirTool,
];

export default fileSystemTools;