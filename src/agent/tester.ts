import path from 'path';
import { ProjectTask, Tester as TesterInterface } from './types';
// 修正: CommandResultとExecOptionsのimport問題を解決
import { commandTools, CommandResult, ExecOptions } from '../tools/commandExecutor';
import { getProjectPath } from '../tools/fileSystem';
import logger from '../utils/logger';
import { toolRegistry, ToolDefinition } from '../llm/toolRegistry';

/**
 * テスト実行モジュール
 * プロジェクトのテストを実行する
 */
export class Tester implements TesterInterface {
  /**
   * テストを実行
   * @param task プロジェクトタスク
   */
  public async runTests(task: ProjectTask): Promise<{ success: boolean; output: string }> {
    logger.info(`Running tests for project: ${task.id}`);
    
    try {
      // テスト用のツールを登録
      this.setupTestingTools(task);
      
      const projectPath = getProjectPath(task.id) as string;
      
      // package.jsonのテストスクリプトを実行
      const runTestsTool = commandTools.find(tool => tool.name === 'executeNpmScript');   
      
      if (runTestsTool) {
        // 型安全な引数を渡す
        const result = await runTestsTool.function(
        projectPath,
        'test'
        );
        
        // 結果の構造をチェック
        if (typeof result === 'object' && result !== null) {
          if ('success' in result && typeof result.success === 'boolean' && 'output' in result && typeof result.output === 'string') {
            // { success: boolean; output: string } の場合
            if (result.success) {
              logger.info('Tests passed successfully');
              return { success: true, output: result.output };
            } else {
              // エラーメッセージにテストが見つからないという内容が含まれているかチェック
              if (
                result.output.includes('no test specified') ||
                result.output.includes('missing script: test')
              ) {
                logger.warn('No test script found in package.json');

                // テスト用フレームワークを自動検出
                const testFramework = await this.detectTestFramework(task);

                if (testFramework) {
                  logger.info(`Detected test framework: ${testFramework}`);

                  // 検出したフレームワークでテストを実行
                  const testCmd = await runTestsTool.function(
                      projectPath,
                      testFramework
                  );

                  if (typeof testCmd === 'object' && testCmd !== null) {
                     if ('success' in testCmd && typeof testCmd.success === 'boolean' && 'output' in testCmd && typeof testCmd.output === 'string') {
                        return {
                          success: testCmd.success,
                          output: testCmd.output
                        };
                     } else if ('stdout' in testCmd && typeof testCmd.stdout === 'string' && 'stderr' in testCmd && typeof testCmd.stderr === 'string') {
                        const success = !testCmd.stderr.includes('ERR!'); // stderr に 'ERR!' がなければ成功とみなす（仮）
                        const output = testCmd.stdout + testCmd.stderr;
                        return { success, output };
                     }
                  }
                  // testCmd が期待した型でない場合
                  return {
                    success: false,
                    output: 'Failed to execute test framework or unexpected result format'
                  };

                } else {
                  logger.warn('No test framework detected');
                  return {
                    success: true, // テストがない場合は成功とみなす
                    output: 'No tests to run. Assuming success.'
                  };
                }
              } else {
                // 'no test specified' 以外のテスト失敗
                logger.error(`Tests failed: ${result.output}`);
                return { success: false, output: result.output };
              }
            }
          } else if ('stdout' in result && typeof result.stdout === 'string' && 'stderr' in result && typeof result.stderr === 'string') {
            // { stdout: string; stderr: string } の場合
            const success = !result.stderr.includes('ERR!'); // stderr に 'ERR!' がなければ成功とみなす（仮）
            const output = result.stdout + result.stderr;
            return { success, output };
          } else {
             // 予期しない result の型
            logger.error('Unexpected result type from test execution');
            return { success: false, output: 'Error in test execution format' };
          }
        } else {
           // result が object でない場合 (通常は発生しないはず)
           logger.error('Unexpected non-object result from test execution');
           return { success: false, output: 'Error in test execution format' };
        }
      } else {
        logger.error('Test execution tool (executeNpmScript) not found');
        return {
          success: false,
          output: 'Test execution tool not found'
        };
      }
    } catch (error) { // try ブロックに対応する catch
      logger.error(`Error running tests: ${(error as Error).message}`);
      return {
        success: false,
        output: (error as Error).message
      };
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
    // try-catch-finally の後、ここには到達しないはずだが、念のためエラーを返す
    // logger.error('Reached end of runTests function unexpectedly');
    // return { success: false, output: 'Unexpected end of function' };
  } // runTests メソッドの終了
  
  /**
   * テストフレームワークを自動検出
   * @param task プロジェクトタスク
   */
  private async detectTestFramework(task: ProjectTask): Promise<string | undefined> {
    try {
      const runCommandTool = commandTools.find(tool => tool.name === 'executeCommand');
      if (!runCommandTool) return undefined;

      const projectPath = getProjectPath(task.id) as string;
      
      // 修正: commandOptionsをオブジェクトに置換
      const commandOptions: ExecOptions = { timeout: 5000 }; 

      // package.jsonの依存関係から検出
      const checkDeps = await (runCommandTool.function as any)(
      'node -e "try { const pkg = require(\'./package.json\'); console.log(JSON.stringify(Object.keys({...pkg.dependencies || {}, ...pkg.devDependencies || {}}))); } catch (e) { console.log(\'[]\'); }"',
      commandOptions,
      projectPath
      );
      
      // stdout があるかチェック
      if (typeof checkDeps === 'object' && checkDeps !== null && 'stdout' in checkDeps && typeof checkDeps.stdout === 'string' && checkDeps.stdout) {
        try {
          const deps = JSON.parse(checkDeps.stdout);

          // よく使われるテストフレームワークの検出
          if (deps.includes('jest')) return 'jest';
          if (deps.includes('mocha')) return 'mocha';
          if (deps.includes('jasmine')) return 'jasmine';
          if (deps.includes('ava')) return 'ava';
          if (deps.includes('tape')) return 'tape';
        } catch (e) {
          logger.warn(`Error parsing dependencies: ${e}`);
        }
      }
      
      // npx コマンドから実行可能かを検出 (Jest, Mocha, Jasmine, Ava を試す)
      const testCommands = [
        { cmd: 'jest', args: '--version' },
        { cmd: 'mocha', args: '--version' },
        { cmd: 'jasmine', args: '--version' },
        { cmd: 'ava', args: '--version' }
      ];

      for (const { cmd, args } of testCommands) {
        const checkCmd = await (runCommandTool.function as any)(
          `npx ${cmd} ${args}`,
          commandOptions,
          projectPath
        );

        // stderr があるか、または success が true かチェック
        if (typeof checkCmd === 'object' && checkCmd !== null) {
            if ('success' in checkCmd && checkCmd.success) {
                // コマンドが成功した場合
                return cmd; // フレームワーク名を返す
            } else if ('stderr' in checkCmd && typeof checkCmd.stderr === 'string' && 
                      !checkCmd.stderr.includes('command not found') && 
                      !checkCmd.stderr.includes('not found') && 
                      !checkCmd.stderr.includes('ERR!')) {
                 // コマンド自体は見つかったが、エラーで終了した場合
                 // return cmd; // より確実な判定が必要かもしれない
            }
        }
      }

      return undefined; // 見つからなかった場合
    } catch (error) {
      logger.warn(`Error detecting test framework: ${(error as Error).message}`);
      return undefined;
    }
  }
  
  /**
   * テスト実行に必要なツールを設定
   * @param task プロジェクトタスク
   */
  private setupTestingTools(task: ProjectTask): void {
    // コマンド実行ツールを登録
    const testingTools = commandTools.map(tool => {
      // ツールのexecute関数をラップして、projectIdを自動で追加
      const wrappedTool: ToolDefinition = {
        name: tool.name,
        description: `Testing tool for project ${task.id}: ${tool.name}`,
        parameters: tool.name === 'executeCommand' ? {
            type: "object",
            properties: {
              command: { type: "string", description: "The command to execute" },
              options: { type: "object", description: "Execution options (e.g., timeout)" },
              workingDir: { type: "string", description: "Working directory" }
            },
            required: ["command"]
          } : tool.name === 'executeNpmScript' ? {
            type: "object",
            properties: {
                script: { type: "string", description: "The npm script name to execute" },
                args: { type: "array", items: { type: "string" }, description: "Arguments for the npm script" }
            },
            required: ["script"]
          } : { type: "object", properties: {} }, // Fallback

        execute: async (args: any) => {
          const projectPath = getProjectPath(task.id);
          if (tool.name === 'executeCommand') {
            return await (tool.function as any)(
              args.command,
              args.options || {},
              args.workingDir || projectPath
            );
          } else if (tool.name === 'executeNpmScript') {
            return await (tool.function as any)(
              projectPath,
              args.script,
              args.args || []
            );
          }
          // commandTools には上記2つしかないので、ここは到達しないはず
          throw new Error(`Unknown testing tool: ${tool.name}`);
        }
      };
      return wrappedTool;
    });

    toolRegistry.registerTools(testingTools);
  }
}