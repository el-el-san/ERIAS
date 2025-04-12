import path from 'path';
import fs from 'fs/promises';
import { ProjectTask, Tester as TesterInterface, ErrorInfo } from './types';
import logger from '../utils/logger';
import { toolRegistry, ToolDefinition } from '../llm/toolRegistry';
import { commandTools } from '../tools/commandExecutor';
import { getProjectPath } from '../tools/fileSystem';
import { withTimeout } from '../utils/asyncUtils';

/**
 * テスト実行モジュール
 * 生成されたコードのテストを実行する
 */
export class Tester implements TesterInterface {
  /**
   * テストを実行
   * @param task プロジェクトタスク
   */
  public async runTests(task: ProjectTask): Promise<{ success: boolean; output: string }> {
    logger.info(`Running tests for project: ${task.id}`);
    
    try {
      // テスト実行用のツールを登録
      this.setupTestingTools(task);
      
      const runTestsTool = commandTools.find(tool => tool.name === 'runTests');
      if (!runTestsTool) {
        throw new Error('runTests tool not found');
      }
      
      // package.jsonからテストコマンドを取得
      const testCommand = await this.getTestCommand(task);
      
      // テスト実行
      logger.debug(`Executing test command: ${testCommand}`);
      const result = await runTestsTool.execute({
        projectId: task.id,
        command: testCommand,
        timeout: 120000, // 2分
      });
      
      if (result.exitCode === 0) {
        logger.info('Tests passed successfully');
        return {
          success: true,
          output: result.output,
        };
      } else {
        logger.warn(`Tests failed with exit code ${result.exitCode}`);
        // エラー情報を解析して保存
        await this.processTestFailure(task, result.output, result.exitCode);
        
        return {
          success: false,
          output: result.output,
        };
      }
    } catch (error) {
      const errorMsg = `Error running tests: ${(error as Error).message}`;
      logger.error(errorMsg);
      
      // エラー情報を保存
      const errorInfo: ErrorInfo = {
        type: 'other',
        message: (error as Error).message,
        stackTrace: (error as Error).stack,
        timeStamp: Date.now(),
        attempts: 0,
      };
      
      task.errors.push(errorInfo);
      
      return {
        success: false,
        output: errorMsg,
      };
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }
  
  /**
   * テスト実行用のツールを設定
   * @param task プロジェクトタスク
   */
  private setupTestingTools(task: ProjectTask): void {
    // コマンド実行ツールを登録
    const testingTools = commandTools.map(tool => {
      // ツールのexecute関数をラップして、projectIdを自動で追加
      const wrappedTool: ToolDefinition = {
        ...tool,
        execute: async (args: any) => {
          return await tool.execute({ ...args, projectId: task.id });
        }
      };
      return wrappedTool;
    });
    
    toolRegistry.registerTools(testingTools);
  }
  
  /**
   * package.jsonからテストコマンドを取得
   * @param task プロジェクトタスク
   */
  private async getTestCommand(task: ProjectTask): Promise<string> {
    const projectPath = getProjectPath(task.id);
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      
      if (packageJson.scripts && packageJson.scripts.test) {
        return 'npm test';
      }
      
      // Jest系のテストコマンドがある場合
      if (packageJson.scripts) {
        const jestCommands = Object.keys(packageJson.scripts).filter(
          key => key.includes('test') || key.includes('jest')
        );
        if (jestCommands.length > 0) {
          return `npm run ${jestCommands[0]}`;
        }
      }
      
      // テストフレームワークがdevDependenciesに含まれているか確認
      const devDeps = packageJson.devDependencies || {};
      if (devDeps.jest) {
        return 'npx jest';
      }
      if (devDeps.mocha) {
        return 'npx mocha';
      }
      
      // デフォルトのテストコマンド
      return 'npm test';
    } catch (error) {
      logger.warn(`Error reading package.json: ${(error as Error).message}`);
      return 'npm test'; // デフォルトのテストコマンド
    }
  }
  
  /**
   * テスト失敗時のエラー情報を解析して保存
   * @param task プロジェクトタスク
   * @param testOutput テスト実行の出力
   * @param exitCode 終了コード
   */
  private async processTestFailure(task: ProjectTask, testOutput: string, exitCode: number): Promise<void> {
    // エラーの種類を判定
    let errorType: 'compilation' | 'runtime' | 'test' | 'other' = 'test';
    if (testOutput.includes('SyntaxError') || testOutput.includes('TypeError') || testOutput.includes('ReferenceError')) {
      errorType = 'compilation';
    } else if (testOutput.includes('RuntimeError') || testOutput.includes('Exception')) {
      errorType = 'runtime';
    }
    
    // エラーメッセージとファイルパスを抽出
    let errorMessage = 'Test failed';
    let filePath: string | undefined;
    let lineNumber: number | undefined;
    
    // エラーメッセージを抽出
    const errorRegex = /(Error|Exception|AssertionError):[^\n]*/;
    const errorMatch = testOutput.match(errorRegex);
    if (errorMatch) {
      errorMessage = errorMatch[0];
    }
    
    // ファイルパスと行番号を抽出
    const filePathRegex = /\s+at\s+[^(]+\(([^:]+):(\d+):(\d+)\)/;
    const filePathMatch = testOutput.match(filePathRegex);
    if (filePathMatch) {
      const fullPath = filePathMatch[1];
      const projectPath = getProjectPath(task.id);
      
      // プロジェクトパスからの相対パスに変換
      if (fullPath.startsWith(projectPath)) {
        filePath = path.relative(projectPath, fullPath);
        lineNumber = parseInt(filePathMatch[2], 10);
      } else {
        filePath = fullPath;
      }
    }
    
    // エラー情報を保存
    const errorInfo: ErrorInfo = {
      type: errorType,
      message: errorMessage,
      stackTrace: testOutput,
      filePath,
      lineNumber,
      timeStamp: Date.now(),
      attempts: 0,
    };
    
    task.errors.push(errorInfo);
  }
}