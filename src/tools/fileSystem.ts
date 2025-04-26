import fs from 'fs/promises';
import path from 'path';
import config from '../config/config.js';
import logger from '../utils/logger.js';

/**
 * パスを正規化して絶対パスに変換
 * @param pathToNormalize 正規化するパス
 */
export function normalizeAbsolutePath(pathToNormalize: string): string {
  return path.resolve(pathToNormalize).replace(/\\/g, '/');
}

/**
 * プロジェクトパスを取得
 * @param taskId タスクID
 */
export function getProjectPath(taskId: string | undefined): string {
  if (!taskId) {
    throw new Error('Task ID is required to get project path');
  }
  const projectsDir = config.agent.projectsDir;
  return path.join(projectsDir, taskId);
}

/**
 * プロジェクトディレクトリを作成
 * @param projectPath プロジェクトパス
 */
export async function createProjectDirectory(projectPath: string): Promise<void> {
  try {
    await fs.mkdir(projectPath, { recursive: true });
    logger.debug(`Created project directory: ${projectPath}`);
  } catch (error) {
    logger.error(`Failed to create project directory: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * 関数型の不一致を解決するためのオーバーロード
 * 複数の引数やオブジェクト引数をサポート
 */
export async function writeProjectFile(projectPath: string, filePath: string, content: string): Promise<void>;
export async function writeProjectFile(args: { projectPath?: string; projectId?: string; filePath: string; content: string }): Promise<void>;
export async function writeProjectFile(projectPathOrArgs: string | { projectPath?: string; projectId?: string; filePath: string; content: string }, filePath?: string, content?: string): Promise<void> {
  let actualProjectPath: string;
  let actualFilePath: string;
  let actualContent: string;
  
  // オブジェクト引数の場合
  if (typeof projectPathOrArgs === 'object') {
    const args = projectPathOrArgs;
    if (!args.projectPath && !args.projectId) {
      throw new Error('Missing required parameter: projectPath or projectId');
    }
    if (!args.filePath) {
      throw new Error('Missing required parameter: filePath');
    }
    if (args.content === undefined) {
      throw new Error('Missing required parameter: content');
    }
    
    actualProjectPath = args.projectPath || getProjectPath(args.projectId);
    actualFilePath = args.filePath;
    actualContent = args.content;
  } else {
    // 個別引数の場合
    if (!projectPathOrArgs) {
      throw new Error('Missing required parameter: projectPath');
    }
    if (!filePath) {
      throw new Error('Missing required parameter: filePath');
    }
    if (content === undefined) {
      throw new Error('Missing required parameter: content');
    }
    
    actualProjectPath = projectPathOrArgs;
    actualFilePath = filePath;
    actualContent = content;
  }
  
  const fullPath = path.join(actualProjectPath, actualFilePath);
  const directory = path.dirname(fullPath);
  
  try {
    // ディレクトリが存在しない場合は作成
    await fs.mkdir(directory, { recursive: true });
    
    // ファイルを書き込み
    await fs.writeFile(fullPath, actualContent, 'utf-8');
    logger.debug(`Wrote file: ${fullPath}`);
  } catch (error) {
    logger.error(`Failed to write file ${fullPath}: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * プロジェクトファイルを読み込み
 * @param projectPath プロジェクトパス
 * @param filePath プロジェクト内のファイルパス
 */
export async function readProjectFile(projectPath: string, filePath: string): Promise<string>;
export async function readProjectFile(args: { projectPath?: string; projectId?: string; filePath: string }): Promise<string>;
export async function readProjectFile(projectPathOrArgs: string | { projectPath?: string; projectId?: string; filePath: string }, filePath?: string): Promise<string> {
  let actualProjectPath: string;
  let actualFilePath: string;
  
  // オブジェクト引数の場合
  if (typeof projectPathOrArgs === 'object') {
    const args = projectPathOrArgs;
    if (!args.projectPath && !args.projectId) {
      throw new Error('Missing required parameter: projectPath or projectId');
    }
    if (!args.filePath) {
      throw new Error('Missing required parameter: filePath');
    }
    
    actualProjectPath = args.projectPath || getProjectPath(args.projectId);
    actualFilePath = args.filePath;
  } else {
    // 個別引数の場合
    if (!projectPathOrArgs) {
      throw new Error('Missing required parameter: projectPath');
    }
    if (!filePath) {
      throw new Error('Missing required parameter: filePath');
    }
    
    actualProjectPath = projectPathOrArgs;
    actualFilePath = filePath;
  }
  
  const fullPath = path.join(actualProjectPath, actualFilePath);
  
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch (error) {
    logger.error(`Failed to read file ${fullPath}: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * ディレクトリの内容を一覧
 * @param projectPath プロジェクトパス
 * @param dirPath プロジェクト内のディレクトリパス
 */
export async function listDirectory(projectPath: string, dirPath?: string): Promise<string[]>;
export async function listDirectory(args: { projectPath?: string; projectId?: string; dirPath?: string }): Promise<string[]>;
export async function listDirectory(projectPathOrArgs: string | { projectPath?: string; projectId?: string; dirPath?: string }, dirPath: string = '.'): Promise<string[]> {
  let actualProjectPath: string;
  let actualDirPath: string;
  
  // オブジェクト引数の場合
  if (typeof projectPathOrArgs === 'object') {
    const args = projectPathOrArgs;
    if (!args.projectPath && !args.projectId) {
      throw new Error('Missing required parameter: projectPath or projectId');
    }
    
    actualProjectPath = args.projectPath || getProjectPath(args.projectId);
    actualDirPath = args.dirPath || '.';
  } else {
    // 個別引数の場合
    if (!projectPathOrArgs) {
      throw new Error('Missing required parameter: projectPath');
    }
    
    actualProjectPath = projectPathOrArgs;
    actualDirPath = dirPath;
  }
  
  const fullPath = path.join(actualProjectPath, actualDirPath);
  
  try {
    const items = await fs.readdir(fullPath);
    return items;
  } catch (error) {
    logger.error(`Failed to list directory ${fullPath}: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * ファイルまたはディレクトリが存在するか確認
 * @param projectPath プロジェクトパス
 * @param itemPath プロジェクト内のパス
 */
export async function exists(projectPath: string, itemPath: string): Promise<boolean>;
export async function exists(args: { projectPath?: string; projectId?: string; itemPath: string }): Promise<boolean>;
export async function exists(projectPathOrArgs: string | { projectPath?: string; projectId?: string; itemPath: string }, itemPath?: string): Promise<boolean> {
  let actualProjectPath: string;
  let actualItemPath: string;
  
  // オブジェクト引数の場合
  if (typeof projectPathOrArgs === 'object') {
    const args = projectPathOrArgs;
    if (!args.projectPath && !args.projectId) {
      throw new Error('Missing required parameter: projectPath or projectId');
    }
    if (!args.itemPath) {
      throw new Error('Missing required parameter: itemPath');
    }
    
    actualProjectPath = args.projectPath || getProjectPath(args.projectId);
    actualItemPath = args.itemPath;
  } else {
    // 個別引数の場合
    if (!projectPathOrArgs) {
      throw new Error('Missing required parameter: projectPath');
    }
    if (!itemPath) {
      throw new Error('Missing required parameter: itemPath');
    }
    
    actualProjectPath = projectPathOrArgs;
    actualItemPath = itemPath;
  }
  
  const fullPath = path.join(actualProjectPath, actualItemPath);
  
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

// エラー修正: fileSystemToolsのエクスポート追加
export const fileSystemTools = [
  {
    name: 'writeProjectFile',
    function: writeProjectFile
  },
  {
    name: 'readProjectFile',
    function: readProjectFile
  },
  {
    name: 'listDirectory',
    function: listDirectory
  },
  {
    name: 'exists',
    function: exists
  },
  {
    name: 'createProjectDirectory',
    function: createProjectDirectory
  }
];
