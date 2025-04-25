import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';

// CommandResult型の定義とエクスポート
export type CommandResult = { success: boolean; output: string; } | { stdout: string; stderr: string; };
// ExecOptionsもエクスポート
export type { ExecOptions };

// execを非同期で呼び出せるようにPromisify
const execAsync = promisify(exec);

/**
 * シェルコマンドを実行
 * @param command 実行するコマンド
 * @param options execオプション
 * @param workingDir 作業ディレクトリ
 */
export async function executeCommand(
  command: string,
  options: ExecOptions = {},
  workingDir?: string
): Promise<{ stdout: string; stderr: string; }> {
  try {
    // 作業ディレクトリを設定
    const execOptions: ExecOptions = {
      ...options,
      cwd: workingDir || process.cwd(),
      maxBuffer: 1024 * 1024 * 10, // 10MB
    };
    
    logger.debug(`Executing command: ${command} in ${execOptions.cwd}`);
    
    // コマンド実行
    const { stdout, stderr } = await execAsync(command, execOptions);
    
    if (stderr) {
      logger.warn(`Command stderr: ${stderr}`);
    }
    
    return { stdout, stderr };
  } catch (error) {
    // エラーが発生した場合でもstdoutとstderrを返す
    const execError = error as { code: number; stdout: string; stderr: string; };
    logger.error(`Command execution failed with code ${execError.code}: ${command}\n${execError.stderr}`);
    
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || (error as Error).message,
    };
  }
}

/**
 * npm installコマンドを実行
 * @param projectPath プロジェクトパス
 * @param dependencies インストールする依存パッケージのリスト
 * @param isDev 開発依存パッケージかどうか
 */
export async function executeNpmInstall(
  projectPath: string,
  dependencies: string | string[] = [],
  isDev: boolean = false
): Promise<boolean> {
  try {
    // 依存パッケージのリストを作成
    const packagesList = Array.isArray(dependencies) ? dependencies.join(' ') : dependencies;
    
    // npm installコマンドを構築
    let command = 'npm install';
    
    // 依存パッケージが指定されている場合
    if (packagesList) {
      command += ` ${packagesList}`;
    }
    
    // 開発依存パッケージの場合は --save-dev オプションを追加
    if (isDev) {
      command += ' --save-dev';
    }
    
    // コマンド実行
    const { stderr } = await executeCommand(command, {}, projectPath);
    
    // エラーチェック
    if (stderr && stderr.includes('ERR!')) {
      logger.error(`npm install failed: ${stderr}`);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error(`npm install failed: ${(error as Error).message}`);
    return false;
  }
}

/**
 * npmスクリプトを実行
 * @param projectPath プロジェクトパス
 * @param script 実行するスクリプト名
 * @param args コマンドライン引数（オプション）
 */
export async function executeNpmScript(
  projectPath: string,
  script: string,
  args: string[] = []
): Promise<{ success: boolean; output: string; }> {
  try {
    // npm run スクリプト（引数があれば追加）
    const command = `npm run ${script}${args.length > 0 ? ' -- ' + args.join(' ') : ''}`;
    
    // コマンド実行
    const { stdout, stderr } = await executeCommand(command, {}, projectPath);
    
    // エラーチェック
    if (stderr && stderr.includes('ERR!')) {
      logger.error(`npm script '${script}' failed: ${stderr}`);
      return { success: false, output: stderr };
    }
    
    return { success: true, output: stdout };
  } catch (error) {
    logger.error(`npm script '${script}' failed: ${(error as Error).message}`);
    return { success: false, output: (error as Error).message };
  }
}

// commandToolsのエクスポート
export const commandTools = [
  {
    name: 'executeCommand',
    function: executeCommand
  },
  {
    name: 'npmInstall',
    function: executeNpmInstall
  },
  {
    name: 'executeNpmScript',
    function: executeNpmScript
  }
];
