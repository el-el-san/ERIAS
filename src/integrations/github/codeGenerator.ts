/**
 * コード生成サービス
 * リポジトリ分析結果に基づいた最適なコード生成を行う
 */

import * as fs from 'fs';
import * as path from 'path';
import { RepositoryAnalyzer, RepoAnalysisResult, ProjectType } from './repositoryAnalyzer';
import logger, { logError } from '../../utils/logger';
import { config } from '../../config/config';
import { generateTemplateByType } from './templates/typescriptTemplates';
import { generatePythonTemplateByType } from './templates/pythonTemplates';
import { LLMIntegration } from './llmIntegration';

export interface CodeGenerationParams {
  repoPath: string;
  taskDescription: string;
  targetFiles?: string[];
  analysisResult?: RepoAnalysisResult;
  owner: string;
  repo: string;
}

export interface CodeGenerationResult {
  generatedFiles: Array<{
    path: string;
    content: string;
  }>;
  taskDescription: string;
  recommendations: string[];
}

export class CodeGenerator {
  private repoPath: string;
  private analysisResult: RepoAnalysisResult | null = null;
  private llm: LLMIntegration;
  
  constructor(private params: CodeGenerationParams) {
    this.repoPath = params.repoPath;
    this.analysisResult = params.analysisResult || null;
    this.llm = new LLMIntegration();
  }
  
  /**
   * コード生成プロセスを実行
   */
  public async generateCode(): Promise<CodeGenerationResult> {
    try {
      logger.info(`コード生成を開始: ${this.params.taskDescription}`);
      
      // リポジトリ分析（まだ実行されていない場合）
      if (!this.analysisResult) {
        const analyzer = new RepositoryAnalyzer(
          this.repoPath, 
          this.params.owner, 
          this.params.repo
        );
        this.analysisResult = await analyzer.analyzeRepository();
      }
      
      // タスク記述からLLMを用いて必要なファイル構造を決定
      const requiredFiles = await this.determineRequiredFiles();
      
      // 各ファイルを生成
      const generatedFiles = await this.generateRequiredFiles(requiredFiles);
      
      // レコメンデーションを生成
      const recommendations = await this.generateRecommendations(generatedFiles);
      
      logger.info(`コード生成完了: ${generatedFiles.length}ファイル生成`);
      
      return {
        generatedFiles,
        taskDescription: this.params.taskDescription,
        recommendations
      };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logError(error, `コード生成中にエラーが発生: ${(error as { message?: string }).message}`);
        throw new Error(`コード生成に失敗しました: ${(error as { message?: string }).message}`);
      } else {
        logError(error, 'コード生成中にエラーが発生: 不明なエラー');
        throw new Error('コード生成に失敗しました: 不明なエラー');
      }
    }
  }
  
  /**
   * タスク記述から必要なファイル構造を決定する
   */
  private async determineRequiredFiles(): Promise<Array<{
    path: string;
    type: string;
    language: string;
    description: string;
  }>> {
    try {
      // ターゲットファイルが指定されている場合は優先的に使用
      if (this.params.targetFiles && this.params.targetFiles.length > 0) {
        return this.params.targetFiles.map(filePath => {
          const ext = path.extname(filePath).toLowerCase();
          let language = 'unknown';
          let type = 'unknown';
          
          // 拡張子から言語とタイプを推測
          if (ext === '.ts' || ext === '.tsx') {
            language = 'typescript';
            type = ext === '.tsx' ? 'react' : 'class';
          } else if (ext === '.js' || ext === '.jsx') {
            language = 'javascript';
            type = ext === '.jsx' ? 'react' : 'function';
          } else if (ext === '.py') {
            language = 'python';
            type = 'class';
          }
          
          return {
            path: filePath,
            type,
            language,
            description: `タスク: ${this.params.taskDescription}`
          };
        });
      }
      
      // LLMを使用してタスク記述から必要なファイルを決定
      const taskFiles = await this.llm.analyzeTaskForFileStructure(
        this.params.taskDescription,
        this.analysisResult!
      );
      
      return taskFiles;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logError(error, `ファイル構造決定中にエラーが発生: ${(error as { message?: string }).message}`);
      } else {
        logError(error, 'ファイル構造決定中にエラーが発生: 不明なエラー');
      }
      
      // エラー時のフォールバック: 基本的な構造を返す
      const primaryLanguage = this.analysisResult?.primaryLanguage.toLowerCase() || 'typescript';
      
      // デフォルトのファイル構造
      if (primaryLanguage === 'typescript' || primaryLanguage === 'javascript') {
        return [
          {
            path: 'src/utils/helper.ts',
            type: 'util',
            language: 'typescript',
            description: `ヘルパー関数: ${this.params.taskDescription}`
          },
          {
            path: 'src/models/types.ts',
            type: 'types',
            language: 'typescript',
            description: `型定義: ${this.params.taskDescription}`
          },
          {
            path: 'src/services/service.ts',
            type: 'class',
            language: 'typescript',
            description: `サービスクラス: ${this.params.taskDescription}`
          }
        ];
      } else if (primaryLanguage === 'python') {
        return [
          {
            path: 'src/utils/helper.py',
            type: 'function',
            language: 'python',
            description: `ヘルパー関数: ${this.params.taskDescription}`
          },
          {
            path: 'src/models/model.py',
            type: 'class',
            language: 'python',
            description: `モデルクラス: ${this.params.taskDescription}`
          },
          {
            path: 'src/services/service.py',
            type: 'class',
            language: 'python',
            description: `サービスクラス: ${this.params.taskDescription}`
          }
        ];
      }
      
      // その他の言語の場合は基本的なクラスファイルのみ
      return [
        {
          path: 'src/main.' + (primaryLanguage === 'python' ? 'py' : 'ts'),
          type: 'class',
          language: primaryLanguage,
          description: `メインクラス: ${this.params.taskDescription}`
        }
      ];
    }
  }
  
  /**
   * 必要なファイルを生成する
   */
  private async generateRequiredFiles(requiredFiles: Array<{
    path: string;
    type: string;
    language: string;
    description: string;
  }>): Promise<Array<{ path: string; content: string }>> {
    const generatedFiles: Array<{ path: string; content: string }> = [];
    
    for (const fileInfo of requiredFiles) {
      try {
        // ファイルパスの解析
        const filePath = fileInfo.path;
        const fileName = path.basename(filePath);
        const fileDir = path.dirname(filePath);
        
        // ディレクトリが存在しない場合は作成
        const fullDir = path.join(this.repoPath, fileDir);
        if (!fs.existsSync(fullDir)) {
          fs.mkdirSync(fullDir, { recursive: true });
        }
        
        // 言語とタイプに基づいてコード生成
        let fileContent = '';
        
        if (fileInfo.language === 'typescript' || fileInfo.language === 'javascript') {
          fileContent = await this.generateTypeScriptFile(fileInfo, fileName);
        } else if (fileInfo.language === 'python') {
          fileContent = await this.generatePythonFile(fileInfo, fileName);
        } else {
          // その他の言語はLLM統合を使用して生成
          fileContent = await this.llm.generateCode(
            fileInfo.description,
            fileInfo.language,
            this.analysisResult!
          );
        }
        
        // 生成したファイルを保存
        generatedFiles.push({
          path: filePath,
          content: fileContent
        });
        
        logger.info(`ファイル生成完了: ${filePath}`);
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'message' in error) {
          logError(error, `ファイル生成中にエラーが発生 (${fileInfo.path}): ${(error as { message?: string }).message}`);
        } else {
          logError(error, `ファイル生成中にエラーが発生 (${fileInfo.path}): 不明なエラー`);
        }
        // エラーが発生しても続行し、可能な限り多くのファイルを生成
      }
    }
    
    return generatedFiles;
  }
  
  /**
   * TypeScript/JavaScriptファイルを生成する
   */
  private async generateTypeScriptFile(
    fileInfo: { path: string; type: string; language: string; description: string },
    fileName: string
  ): Promise<string> {
    try {
      // 基本パラメータを準備
      const params = {
        fileName,
        description: fileInfo.description,
        projectName: this.analysisResult?.repoName || 'project',
        author: 'ERIAS AI',
        date: new Date().toISOString().split('T')[0]
      };
      
      // ファイルタイプに応じたテンプレート生成
      if (fileInfo.type === 'class') {
        // クラス名は先頭大文字に
        const className = this.getClassName(fileName);
        
        return generateTemplateByType('class', {
          ...params,
          className,
          methods: [
            {
              name: 'execute',
              description: 'メインの実行メソッド',
              isAsync: true,
              returnType: 'Promise<boolean>',
              params: [
                { name: 'data', type: 'any', description: '入力データ' }
              ]
            },
            {
              name: 'validate',
              description: 'データ検証メソッド',
              returnType: 'boolean',
              params: [
                { name: 'data', type: 'any', description: '検証対象データ' }
              ]
            }
          ],
          properties: [
            {
              name: 'config',
              type: 'Record<string, any>',
              description: '設定オブジェクト',
              visibility: 'private'
            }
          ]
        });
      } else if (fileInfo.type === 'interface' || fileInfo.type === 'types') {
        // インターフェース名は先頭大文字に
        const interfaceName = this.getClassName(fileName);
        
        return generateTemplateByType('types', {
          ...params,
          interfaceName,
          moduleName: path.dirname(fileInfo.path).split('/').pop(),
          properties: [
            {
              name: 'id',
              type: 'string',
              description: '一意識別子'
            },
            {
              name: 'name',
              type: 'string',
              description: '名前'
            },
            {
              name: 'data',
              type: 'Record<string, any>',
              description: 'データオブジェクト'
            },
            {
              name: 'createdAt',
              type: 'Date',
              description: '作成日時'
            }
          ]
        });
      } else if (fileInfo.type === 'util') {
        return generateTemplateByType('util', {
          ...params,
          methods: [
            {
              name: 'processData',
              description: 'データ処理関数',
              isAsync: true,
              returnType: 'Promise<Record<string, any>>',
              params: [
                { name: 'input', type: 'Record<string, any>', description: '入力データ' }
              ]
            },
            {
              name: 'formatOutput',
              description: '出力フォーマット関数',
              returnType: 'string',
              params: [
                { name: 'data', type: 'Record<string, any>', description: 'フォーマット対象データ' }
              ]
            }
          ]
        });
      } else if (fileInfo.type === 'test') {
        return generateTemplateByType('test', {
          ...params,
          className: this.getClassName(fileName.replace('.test.ts', '').replace('.spec.ts', '')),
          methods: [
            {
              name: 'execute',
              description: 'メインの実行メソッド',
              isAsync: true,
              returnType: 'Promise<boolean>'
            },
            {
              name: 'validate',
              description: 'データ検証メソッド',
              returnType: 'boolean'
            }
          ]
        });
      } else if (fileInfo.type === 'react') {
        return generateTemplateByType('react', {
          ...params,
          className: this.getClassName(fileName.replace('.tsx', '').replace('.jsx', '')),
          properties: [
            {
              name: 'title',
              type: 'string',
              description: 'タイトル'
            },
            {
              name: 'data',
              type: 'Array<Record<string, any>>',
              description: 'データ配列'
            },
            {
              name: 'onAction',
              type: '() => void',
              description: 'アクションハンドラ'
            }
          ]
        });
      } else {
        // タイプが特定できない場合はLLMを使用
        return await this.llm.generateCode(
          fileInfo.description,
          fileInfo.language,
          this.analysisResult!
        );
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logError(error, `TypeScriptファイル生成エラー: ${(error as { message?: string }).message}`);
      } else {
        logError(error, 'TypeScriptファイル生成エラー: 不明なエラー');
      }
      throw error;
    }
  }
  
  /**
   * Pythonファイルを生成する
   */
  private async generatePythonFile(
    fileInfo: { path: string; type: string; language: string; description: string },
    fileName: string
  ): Promise<string> {
    try {
      // 基本パラメータを準備
      const params = {
        fileName,
        description: fileInfo.description,
        projectName: this.analysisResult?.repoName || 'project',
        author: 'ERIAS AI',
        date: new Date().toISOString().split('T')[0],
        pythonVersion: '3.8+'
      };
      
      // モジュール名の取得
      const moduleName = path.basename(fileName, '.py');
      
      // ファイルタイプに応じたテンプレート生成
      if (fileInfo.type === 'class') {
        // クラス名は先頭大文字のキャメルケース
        const className = this.getClassName(fileName);
        
        return generatePythonTemplateByType('class', {
          ...params,
          className,
          moduleName,
          methods: [
            {
              name: 'execute',
              description: 'メインの実行メソッド',
              isAsync: false,
              returnType: 'bool',
              params: [
                { name: 'data', type: 'dict', description: '入力データ' }
              ]
            },
            {
              name: 'validate',
              description: 'データ検証メソッド',
              returnType: 'bool',
              params: [
                { name: 'data', type: 'dict', description: '検証対象データ' }
              ]
            }
          ],
          attributes: [
            {
              name: 'config',
              type: 'dict',
              description: '設定オブジェクト',
              isPrivate: true
            }
          ]
        });
      } else if (fileInfo.type === 'function') {
        return generatePythonTemplateByType('function', {
          ...params,
          moduleName,
          methods: [
            {
              name: 'process_data',
              description: 'データ処理関数',
              isAsync: false,
              returnType: 'dict',
              params: [
                { name: 'input_data', type: 'dict', description: '入力データ' }
              ]
            },
            {
              name: 'format_output',
              description: '出力フォーマット関数',
              returnType: 'str',
              params: [
                { name: 'data', type: 'dict', description: 'フォーマット対象データ' }
              ]
            }
          ]
        });
      } else if (fileInfo.type === 'test') {
        return generatePythonTemplateByType('test', {
          ...params,
          className: this.getClassName(moduleName.replace('test_', '').replace('_test', '')),
          moduleName: moduleName.replace('test_', '').replace('_test', ''),
          methods: [
            {
              name: 'execute',
              description: 'メインの実行メソッド',
              returnType: 'bool'
            },
            {
              name: 'validate',
              description: 'データ検証メソッド',
              returnType: 'bool'
            }
          ]
        });
      } else if (fileInfo.type === 'flask') {
        return generatePythonTemplateByType('flask', params);
      } else if (fileInfo.type === 'django') {
        return generatePythonTemplateByType('django', params);
      } else {
        // タイプが特定できない場合はLLMを使用
        return await this.llm.generateCode(
          fileInfo.description,
          fileInfo.language,
          this.analysisResult!
        );
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logError(`Pythonファイル生成エラー: ${(error as { message?: string }).message}`);
      } else {
        logError('Pythonファイル生成エラー: 不明なエラー');
      }
      throw error;
    }
  }
  
  /**
   * ファイル名からクラス名を生成
   */
  private getClassName(fileName: string): string {
    // 拡張子を削除
    const baseName = path.basename(fileName, path.extname(fileName));
    
    // ケバブケースやスネークケースをキャメルケースに変換
    const camelCase = baseName
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    // 先頭を大文字に
    return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
  }
  
  /**
   * コード生成後のレコメンデーションを生成
   */
  private async generateRecommendations(
    generatedFiles: Array<{ path: string; content: string }>
  ): Promise<string[]> {
    try {
      // LLMを使用してレコメンデーションを生成
      return await this.llm.generateRecommendations(
        this.params.taskDescription,
        generatedFiles,
        this.analysisResult!
      );
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logError(`レコメンデーション生成エラー: ${(error as { message?: string }).message}`);
      } else {
        logError('レコメンデーション生成エラー: 不明なエラー');
      }
      
      // デフォルトのレコメンデーション
      return [
        '生成したコードを必ず確認・テストしてください',
        '必要に応じて詳細な実装を追加してください',
        'READMEを更新して変更内容を記録することを推奨します'
      ];
    }
  }
}
