import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * プロンプトテンプレートの種類
 */
export enum PromptType {
  SYSTEM = 'system_prompt',
  PLAN = 'plan_prompt',
  CODE = 'code_prompt',
  DEBUG = 'debug_prompt',
}

/**
 * プロンプト構築用のクラス
 * テンプレートの読み込み、変数の置換、プロンプトの構築を担当
 */
export class PromptBuilder {
  private templates: Map<PromptType, string> = new Map();
  private promptsDir: string;

  /**
   * PromptBuilderを初期化
   * @param promptsDir プロンプトテンプレートファイルのディレクトリパス
   */
  constructor(promptsDir: string = path.resolve(process.cwd(), 'prompts')) {
    this.promptsDir = promptsDir;
    this.loadTemplates();
  }

  /**
   * テンプレートファイルを読み込み
   */
  private loadTemplates(): void {
    try {
      // 各プロンプトタイプに対応するファイルを読み込み
      for (const type of Object.values(PromptType)) {
        const filePath = path.join(this.promptsDir, `${type}.md`);
        if (fs.existsSync(filePath)) {
          const template = fs.readFileSync(filePath, 'utf-8');
          this.templates.set(type as PromptType, template);
          logger.debug(`Loaded prompt template: ${type}`);
        } else {
          logger.warn(`Prompt template file not found: ${filePath}`);
        }
      }
    } catch (error) {
      logger.error(`Error loading prompt templates: ${(error as Error).message}`);
    }
  }

  /**
   * 特定のテンプレートを手動で設定
   * @param type プロンプトタイプ
   * @param template テンプレート文字列
   */
  public setTemplate(type: PromptType, template: string): void {
    this.templates.set(type, template);
  }

  /**
   * テンプレートを取得
   * @param type プロンプトタイプ
   */
  public getTemplate(type: PromptType): string | undefined {
    return this.templates.get(type);
  }

  /**
   * テンプレートに変数を埋め込んでプロンプトを生成
   * @param type プロンプトタイプ
   * @param variables 埋め込む変数のマップ
   */
  public build(type: PromptType, variables: Record<string, string> = {}): string {
    const template = this.templates.get(type);
    if (!template) {
      throw new Error(`Template not found for type: ${type}`);
    }

    // 変数を埋め込み
    let prompt = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      prompt = prompt.replace(placeholder, value);
    }

    // 未置換の変数プレースホルダーを警告
    const remainingPlaceholders = prompt.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g);
    if (remainingPlaceholders) {
      logger.warn(`Unused variables in prompt: ${remainingPlaceholders.join(', ')}`);
    }

    return prompt;
  }

  /**
   * システムプロンプトを生成
   * @param variables 埋め込む変数
   */
  public buildSystemPrompt(variables: Record<string, string> = {}): string {
    return this.build(PromptType.SYSTEM, variables);
  }

  /**
   * 計画立案用プロンプトを生成
   * @param spec ユーザー指定の要求仕様
   * @param variables その他の埋め込み変数
   */
  public buildPlanPrompt(spec: string, variables: Record<string, string> = {}): string {
    return this.build(PromptType.PLAN, {
      ...variables,
      spec,
    });
  }

  /**
   * コード生成用プロンプトを生成
   * @param filePath 生成するファイルパス
   * @param fileDescription ファイルの説明や実装すべき機能
   * @param relatedCode 関連するコード (インポート元、インターフェースなど)
   * @param variables その他の埋め込み変数
   */
  public buildCodePrompt(
    filePath: string,
    fileDescription: string,
    relatedCode: string = '',
    variables: Record<string, string> = {}
  ): string {
    return this.build(PromptType.CODE, {
      ...variables,
      filePath,
      fileDescription,
      relatedCode,
    });
  }

  /**
   * デバッグ用プロンプトを生成
   * @param errorMessage エラーメッセージ
   * @param errorCode エラーが発生したコード
   * @param stackTrace スタックトレース (存在する場合)
   * @param testCode テストコード (存在する場合)
   * @param variables その他の埋め込み変数
   */
  public buildDebugPrompt(
    errorMessage: string,
    errorCode: string,
    stackTrace: string = '',
    testCode: string = '',
    variables: Record<string, string> = {}
  ): string {
    return this.build(PromptType.DEBUG, {
      ...variables,
      errorMessage,
      errorCode,
      stackTrace,
      testCode,
    });
  }
}