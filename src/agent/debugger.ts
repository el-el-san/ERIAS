import path from 'path';
import fs from 'fs/promises';
import { ProjectTask, ErrorInfo, Debugger as DebuggerInterface } from './types.js';
import { GeminiClient } from '../llm/geminiClient.js';
import { PromptBuilder, PromptType } from '../llm/promptBuilder.js';
import logger from '../utils/logger.js';
import { toolRegistry, ToolDefinition } from '../llm/toolRegistry.js';
import { fileSystemTools, getProjectPath } from '../tools/fileSystem.js';
import { commandTools } from '../tools/commandExecutor.js';
import { withRetry } from '../utils/asyncUtils.js';

/**
 * デバッグモジュール
 * エラーを分析し、修正案を適用する
 */
export class Debugger implements DebuggerInterface {
  private geminiClient: GeminiClient;
  private promptBuilder: PromptBuilder;
  
  /**
   * Debuggerを初期化
   * @param geminiClient Gemini APIクライアント
   * @param promptBuilder プロンプトビルダー
   */
  constructor(geminiClient: GeminiClient, promptBuilder: PromptBuilder) {
    this.geminiClient = geminiClient;
    this.promptBuilder = promptBuilder;
  }
  
  /**
   * エラーを修正
   * @param task プロジェクトタスク
   * @param errorInfo エラー情報
   */
  public async fixError(task: ProjectTask, errorInfo: ErrorInfo): Promise<boolean> {
    logger.info(`Attempting to fix error in project: ${task.id}`);
    logger.debug(`Error type: ${errorInfo.type}, message: ${errorInfo.message}`);
    
    // エラー情報の修正試行回数をインクリメント
    errorInfo.attempts += 1;
    
    try {
      // デバッグ用のツールを登録
      this.setupDebugTools(task);
      
      // エラーが発生したファイルのコードを取得
      let errorCode = '';
      let filePath = errorInfo.filePath;
      
      if (filePath) {
        // ファイルが指定されている場合は読み込み
        const projectPath = getProjectPath(task.id);
        const fullPath = path.join(projectPath, filePath);
        
        try {
          errorCode = await fs.readFile(fullPath, 'utf-8');
        } catch (error) {
          logger.warn(`Could not read file with error: ${filePath}, ${(error as Error).message}`);
          
          // ファイルが見つからない場合は、エラーに関連する可能性のあるファイルを探す
          filePath = await this.findRelatedFile(task, errorInfo);
          if (filePath) {
            const alternatePath = path.join(projectPath, filePath);
            errorCode = await fs.readFile(alternatePath, 'utf-8');
          }
        }
      } else {
        // ファイルが指定されていない場合は、エラーメッセージからファイルを推測
        filePath = await this.findRelatedFile(task, errorInfo);
        if (filePath) {
          const projectPath = getProjectPath(task.id);
          const fullPath = path.join(projectPath, filePath);
          errorCode = await fs.readFile(fullPath, 'utf-8');
        }
      }
      
      // テストコードを取得
      const testCode = await this.findRelatedTestFile(task, filePath);
      
      // プロンプト変数を準備
      const variables = {
        projectName: path.basename(task.projectPath),
        projectDescription: task.plan?.projectDescription || '',
        errorMessage: errorInfo.message,
        errorCode: errorCode || 'No code found',
        stackTrace: errorInfo.stackTrace || '',
        testCode: testCode || '',
        attemptCount: String(errorInfo.attempts),
        currentTime: new Date().toISOString(),
      };
      
      // デバッグ用プロンプトを生成
      const prompt = this.promptBuilder.buildDebugPrompt(
        errorInfo.message,
        errorCode,
        errorInfo.stackTrace || '',
        testCode || '',
        variables
      );
      const systemPrompt = this.promptBuilder.buildSystemPrompt(variables);
      
      // Gemini API（Function Calling）でデバッグを実行
      logger.debug(`Sending debug prompt for error: "${errorInfo.message.slice(0, 100)}..." to Gemini API`);
      const debugResponse = await this.geminiClient.runToolConversation(prompt, systemPrompt);
      
      logger.debug(`Debug response received, length: ${debugResponse.length} characters`);
      
      // 修正が成功したかどうか（デフォルトでは失敗とみなす）
      let fixSuccessful = false;
      
      // 修正案がコードブロックを含む場合、それを抽出して適用
      const codeBlockRegex = /```(?:[a-zA-Z]+)?(\n|\r\n|\r)([\s\S]*?)```/g;
      const matches = [...debugResponse.matchAll(codeBlockRegex)];
      
      if (matches.length > 0 && filePath) {
        // 最初のコードブロックを適用
        const fixedCode = matches[0][2].trim();
        const projectPath = getProjectPath(task.id);
        const fullPath = path.join(projectPath, filePath);
        
        // 修正コードを書き込む
        await fs.writeFile(fullPath, fixedCode, 'utf-8');
        logger.info(`Applied fix to file: ${filePath}`);
        fixSuccessful = true;
      } else if (filePath) {
        // コードブロックがない場合でも、ファイルパスが特定できている場合は
        // レスポンスから修正案を推測して適用
        const fixes = this.extractFixesFromResponse(debugResponse, errorCode);
        if (fixes) {
          const projectPath = getProjectPath(task.id);
          const fullPath = path.join(projectPath, filePath);
          
          // 修正コードを書き込む
          await fs.writeFile(fullPath, fixes, 'utf-8');
          logger.info(`Applied extracted fixes to file: ${filePath}`);
          fixSuccessful = true;
        }
      }
      
      // 修正を実施した場合の追加対応
      if (fixSuccessful) {
        // 修正の説明をログに残す
        logger.debug(`Fix details: ${debugResponse.slice(0, 500)}...`);
        return true;
      } else {
        logger.warn('Could not apply any fixes from debug response');
        return false;
      }
    } catch (error) {
      logger.error(`Error fixing bug: ${(error as Error).message}`);
      return false;
    } finally {
      // 登録したツールを解除
      toolRegistry.clearTools();
    }
  }
  
  /**
   * デバッグに必要なツールを設定
   * @param task プロジェクトタスク
   */
  private setupDebugTools(task: ProjectTask): void {
    // ファイルシステムツールとコマンド実行ツールを登録
    const debugTools = [
      ...fileSystemTools,
      ...commandTools
    ].map(tool => {
      // ツールのexecute関数をラップして、projectIdを自動で追加
      const wrappedTool: ToolDefinition = {
        name: tool.name,
        description: `Debug tool for project ${task.id}: ${tool.name}`,
        parameters: {
          type: "object",
          properties: {
            projectPath: { type: "string" },
            filePath: { type: "string" },
            content: { type: "string" }
          },
          required: ["projectPath"]
        },
        execute: async (args: any) => {
          if (tool.name === 'writeProjectFile') {
            // 必要な引数がすべて揃っていることを確認
            if (!args.filePath || args.content === undefined) {
              throw new Error(`Missing required parameter for writeProjectFile: filePath=${args.filePath}, content is defined=${args.content !== undefined}`);
            }
            // 修正: 適切に引数を渡す
            return await (tool.function as any)(
              args.projectPath || getProjectPath(task.id),
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
    
    toolRegistry.registerTools(debugTools);
  }
  
  /**
   * エラーに関連するファイルを特定
   * @param task プロジェクトタスク
   * @param errorInfo エラー情報
   */
  private async findRelatedFile(task: ProjectTask, errorInfo: ErrorInfo): Promise<string | undefined> {
    // エラーメッセージからファイル名のヒントを探す
    const possibleFileNames: string[] = [];
    
    // エラーメッセージからモジュール名やクラス名を抽出
    const errorMsg = errorInfo.message + (errorInfo.stackTrace || '');
    
    // 一般的なパターン
    const filePatterns = [
      /[Mm]odule\s+['"](.*?)['"]/, // 'Module "xxx" not found'
      /\s+from\s+['"](.*?)['"]/, // 'cannot import xxx from "yyy"'
      /([A-Za-z0-9_]+\.[jt]sx?)/, // 'xxx.js:10'
      /([A-Za-z0-9_]+)\s+is not defined/, // 'xxx is not defined'
      /class\s+([A-Za-z0-9_]+)/, // 'class xxx'
      /function\s+([A-Za-z0-9_]+)/ // 'function xxx'
    ];
    
    for (const pattern of filePatterns) {
      const matches = errorMsg.match(pattern);
      if (matches && matches[1]) {
        possibleFileNames.push(matches[1]);
      }
    }
    
    // プロジェクト内のファイルを検索
    const projectPath = getProjectPath(task.id);
    
    try {
      // 直接のファイル名候補をまず確認
      for (const candidate of possibleFileNames) {
        // 拡張子を含む場合と含まない場合を両方確認
        const hasExtension = /\.[jt]sx?$/.test(candidate);
        
        if (hasExtension) {
          try {
            const fullPath = path.join(projectPath, candidate);
            await fs.access(fullPath);
            return candidate; // ファイルが存在する
          } catch {}
        } else {
          // 拡張子バリエーションを試す
          for (const ext of ['.js', '.jsx', '.ts', '.tsx']) {
            try {
              const fullPath = path.join(projectPath, `${candidate}${ext}`);
              await fs.access(fullPath);
              return `${candidate}${ext}`; // ファイルが存在する
            } catch {}
          }
        }
      }
      
      // メインファイル（index.jsなど）を探す
      const mainFiles = ['index.js', 'index.ts', 'app.js', 'app.ts', 'main.js', 'main.ts'];
      for (const mainFile of mainFiles) {
        try {
          const fullPath = path.join(projectPath, mainFile);
          await fs.access(fullPath);
          return mainFile; // ファイルが存在する
        } catch {}
      }
      
      // package.jsonからmainフィールドを確認
      try {
        const packageJsonPath = path.join(projectPath, 'package.json');
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        if (packageJson.main) {
          return packageJson.main;
        }
      } catch {}
      
      return undefined; // 関連ファイルが見つからない
    } catch (error) {
      logger.error(`Error finding related file: ${(error as Error).message}`);
      return undefined;
    }
  }
  
  /**
   * 関連するテストファイルを探す
   * @param task プロジェクトタスク
   * @param filePath 対象ファイルパス
   */
  private async findRelatedTestFile(task: ProjectTask, filePath?: string): Promise<string | undefined> {
    if (!filePath) return undefined;
    
    const projectPath = getProjectPath(task.id);
    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));
    
    // 一般的なテストファイル命名パターン
    const testPatterns = [
      `${fileNameWithoutExt}.test.js`,
      `${fileNameWithoutExt}.test.ts`,
      `${fileNameWithoutExt}.spec.js`,
      `${fileNameWithoutExt}.spec.ts`,
      `test-${fileNameWithoutExt}.js`,
      `test-${fileNameWithoutExt}.ts`
    ];
    
    // __tests__ディレクトリも検索
    const testDirs = ['', '__tests__/', 'tests/', 'test/'];
    
    try {
      for (const dir of testDirs) {
        for (const pattern of testPatterns) {
          const testPath = path.join(dir, pattern);
          const fullPath = path.join(projectPath, testPath);
          
          try {
            await fs.access(fullPath);
            // ファイルが存在する場合は内容を読み込んで返す
            const testContent = await fs.readFile(fullPath, 'utf-8');
            return testContent;
          } catch {}
        }
      }
      
      return undefined; // テストファイルが見つからない
    } catch (error) {
      logger.warn(`Error finding test file: ${(error as Error).message}`);
      return undefined;
    }
  }
  
  /**
   * レスポンスから修正案を抽出
   * @param response デバッグレスポンス
   * @param originalCode 元のコード
   */
  private extractFixesFromResponse(response: string, originalCode: string): string | undefined {
    if (!originalCode) return undefined;
    
    // レスポンスがまるごとコードかどうかを確認
    if (response.trim().startsWith('import ') || 
        response.trim().startsWith('const ') || 
        response.trim().startsWith('function ') || 
        response.trim().startsWith('class ')) {
      return response.trim();
    }
    
    // 「修正後」や「修正版」などの後に続くコードを探す
    const fixedVersionRegex = /修正後[:\n]([\s\S]*?)(?:```|$)|修正版[:\n]([\s\S]*?)(?:```|$)|Fixed code[:\n]([\s\S]*?)(?:```|$)|After fix[:\n]([\s\S]*?)(?:```|$)/i;
    const fixedMatch = response.match(fixedVersionRegex);
    if (fixedMatch) {
      const fixedCode = fixedMatch[1] || fixedMatch[2] || fixedMatch[3] || fixedMatch[4];
      if (fixedCode && fixedCode.trim().length > 0) {
        return fixedCode.trim();
      }
    }
    
    // ヒントから修正を試みる
    const lines = originalCode.split('\n');
    let modified = false;
    
    // 「行xx」または「linexx」という表現を探す
    const lineFixRegex = /(?:行|line)\s*(\d+)(?:[^\n]*?)(?:から|を|should be|change to)[^\n]*?[`'"]([^`'"]+)[`'"]|(?:Change|Replace|Fix)\s*[`'"]([^`'"]+)[`'"]\s*(?:to|with)\s*[`'"]([^`'"]+)[`'"]/gi;
    
    let match;
    while ((match = lineFixRegex.exec(response)) !== null) {
      if (match[1] && match[2]) { // 行番号と置換文字列がある場合
        const lineNum = parseInt(match[1], 10) - 1; // 0ベースインデックス
        if (lineNum >= 0 && lineNum < lines.length) {
          lines[lineNum] = match[2];
          modified = true;
        }
      } else if (match[3] && match[4]) { // 置換前と置換後の文字列がある場合
        const before = match[3];
        const after = match[4];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(before)) {
            lines[i] = lines[i].replace(before, after);
            modified = true;
          }
        }
      }
    }
    
    return modified ? lines.join('\n') : undefined;
  }
}