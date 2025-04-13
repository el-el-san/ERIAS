import { exec, spawn, SpawnOptions } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import logger from '../utils/logger';
import { resolveSafePath, getProjectPath } from './fileSystem';
import { ToolDefinition } from '../llm/toolRegistry';
import { withTimeout } from '../utils/asyncUtils';

// 安全に実行可能なコマンドのホワイトリスト
const SAFE_COMMANDS = [
  'npm', 'npx', 'node', 'yarn', 'jest', 'mocha',
  'tsc', 'eslint', 'prettier', 'webpack', 'vite',
];

// execのPromise版
const execAsync = promisify(exec);

/**
 * コマンドが安全かどうかチェック
 * @param command 実行するコマンド
 */
const isSafeCommand = (command: string): boolean => {
  const baseCommand = command.split(' ')[0].toLowerCase();
  return SAFE_COMMANDS.includes(baseCommand);
};

/**
 * コマンド実行ツール
 * ホワイトリストに含まれるコマンドのみをプロジェクトディレクトリ内で実行
 */
export const runCommandTool: ToolDefinition = {
  name: 'runCommand',
  description: 'Run a command in the project directory',
  parameters: {
    type: 'object',
    required: ['command'],
    properties: {
      command: {
        type: 'string',
        description: 'Command to run (npm, npx, node, etc.)',
      },
      cwd: {
        type: 'string',
        description: 'Working directory relative to project root',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 60000)',
      },
    },
  },
  execute: async (args: { command: string; cwd?: string; timeout?: number; projectId: string }): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    const command = args.command.trim();
    
    // コマンドの安全性チェック
    if (!isSafeCommand(command)) {
      throw new Error(`Security violation: Command ${command.split(' ')[0]} is not in the whitelist`);
    }
    
    const projectPath = getProjectPath(args.projectId);
    const workingDir = args.cwd
      ? resolveSafePath(projectPath, args.cwd)
      : projectPath;
    
    logger.debug(`Running command: ${command} in ${workingDir}`);
    
    try {
      // タイムアウト付きでコマンド実行
      const timeout = args.timeout || 60000; // デフォルト1分
      const { stdout, stderr } = await withTimeout(
        execAsync(command, { cwd: workingDir }),
        timeout,
        `Command execution timed out after ${timeout}ms: ${command}`
      );
      
      return {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: 0,
      };
    } catch (error: any) {
      // execはエラー時に終了コードを返す
      logger.error(`Command execution error: ${error.message}`);
      return {
        stdout: error.stdout ? error.stdout.toString() : '',
        stderr: error.stderr ? error.stderr.toString() : error.message,
        exitCode: error.code || 1,
      };
    }
  },
};

/**
 * npm installコマンド専用のツール
 * package.jsonに基づく依存関係のインストールや指定パッケージのインストールを実行
 */
export const npmInstallTool: ToolDefinition = {
  name: 'npmInstall',
  description: 'Install npm dependencies',
  parameters: {
    type: 'object',
    required: [],
    properties: {
      packages: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'List of packages to install. If empty, install all dependencies from package.json',
      },
      dev: {
        type: 'boolean',
        description: 'Whether to install as dev dependencies (default: false)',
      },
      cwd: {
        type: 'string',
        description: 'Working directory relative to project root',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 300000)',
      },
    },
  },
  execute: async (args: { packages?: string[]; dev?: boolean; cwd?: string; timeout?: number; projectId: string }): Promise<{ success: boolean; output: string }> => {
    const projectPath = getProjectPath(args.projectId);
    const workingDir = args.cwd
      ? resolveSafePath(projectPath, args.cwd)
      : projectPath;
    
    // npm installコマンドを構築
    let command = 'npm install';
    if (args.packages && args.packages.length > 0) {
      // 特定のパッケージをインストール
      command += ` ${args.packages.join(' ')}`;
      if (args.dev) {
        command += ' --save-dev';
      }
    }
    
    logger.debug(`Running npm install: ${command} in ${workingDir}`);
    
    try {
      // タイムアウト付きでnpm installを実行（デフォルト5分）
      const timeout = args.timeout || 300000;
      const { stdout, stderr } = await withTimeout(
        execAsync(command, { cwd: workingDir }),
        timeout,
        `npm install timed out after ${timeout}ms`
      );
      
      return {
        success: true,
        output: stdout.toString(),
      };
    } catch (error: any) {
      logger.error(`npm install error: ${error.message}`);
      return {
        success: false,
        output: error.stderr ? error.stderr.toString() : error.message,
      };
    }
  },
};

/**
 * テスト実行ツール
 * Jest、Mocha等のテストフレームワークを実行
 */
export const runTestsTool: ToolDefinition = {
  name: 'runTests',
  description: 'Run project tests',
  parameters: {
    type: 'object',
    required: [],
    properties: {
      command: {
        type: 'string',
        description: 'Test command (default: "npm test")',
      },
      cwd: {
        type: 'string',
        description: 'Working directory relative to project root',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000)',
      },
    },
  },
  execute: async (args: { command?: string; cwd?: string; timeout?: number; projectId: string }): Promise<{ success: boolean; output: string; exitCode: number }> => {
    const projectPath = getProjectPath(args.projectId);
    const workingDir = args.cwd
      ? resolveSafePath(projectPath, args.cwd)
      : projectPath;
    
    // テストコマンドを設定（デフォルトは "npm test"）
    const command = args.command || 'npm test';
    
    logger.debug(`Running tests: ${command} in ${workingDir}`);
    
    try {
      // タイムアウト付きでテスト実行（デフォルト2分）
      const timeout = args.timeout || 120000;
      const { stdout, stderr } = await withTimeout(
        execAsync(command, { cwd: workingDir }),
        timeout,
        `Tests timed out after ${timeout}ms`
      );
      
      return {
        success: true,
        output: stdout.toString() + '\n' + stderr.toString(),
        exitCode: 0,
      };
    } catch (error: any) {
      logger.error(`Test execution error: ${error.message}`);
      const success = false;
      const output = error.stdout ? error.stdout.toString() : '';
      const errorOutput = error.stderr ? error.stderr.toString() : error.message;
      
      return {
        success,
        output: output + '\n' + errorOutput,
        exitCode: error.code || 1,
      };
    }
  },
};

// コマンド実行ツール一覧
export const commandTools: ToolDefinition[] = [
  runCommandTool,
  npmInstallTool,
  runTestsTool,
];

export default commandTools;