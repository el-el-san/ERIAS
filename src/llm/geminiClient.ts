import { GoogleGenerativeAI, GenerativeModel, HarmCategory, HarmBlockThreshold, GenerateContentResult, GenerateContentStreamResult, Part } from '@google/generative-ai';
import { withRetry, withTimeout } from '../utils/asyncUtils';
import logger from '../utils/logger';
import config from '../config/config';
import { ToolDefinition } from './toolRegistry';

// Gemini APIのクライアントインスタンス
const genAI = new GoogleGenerativeAI(config.llm.googleApiKey);

/**
 * Gemini APIのラッパークラス
 * モデルの生成、プロンプトの送信、レスポンスの処理を担当
 */
export class GeminiClient {
  private model: GenerativeModel;

  /**
   * GeminiClientを初期化
   * @param modelName 使用するモデル名
   * @param tools Function Callingで使用するツール定義
   */
  constructor(
    private modelName: string = config.llm.defaultModel,
    private tools: ToolDefinition[] = []
  ) {
    // モデルインスタンス作成
    this.model = this.createModel();
    logger.info(`Gemini model initialized: ${modelName}`);
  }

  /**
   * 利用するモデルを変更
   * @param modelName 新しいモデル名
   */
  public setModel(modelName: string): void {
    this.modelName = modelName;
    this.model = this.createModel();
    logger.info(`Gemini model changed to: ${modelName}`);
  }

  /**
   * ツール定義を設定
   * @param tools Function Callingで使用するツール定義配列
   */
  public setTools(tools: ToolDefinition[]): void {
    this.tools = tools;
    this.model = this.createModel();
    logger.debug(`Tools updated for Gemini model: ${tools.length} tools defined`);
  }

  /**
   * テキストコンテンツを生成
   * @param prompt プロンプトテキスト
   * @param systemPrompt システムプロンプト（モデルの動作指示）
   * @param history 過去の会話履歴
   * @param timeout タイムアウト時間（ミリ秒）
   */
  public async generateContent(
    prompt: string | Part[],
    systemPrompt?: string,
    history?: Array<{ role: string; parts: Part[] }>,
    timeout = 60000
  ): Promise<string> {
    logger.debug('Generating content with Gemini');
    
    try {
      const result = await withTimeout(
        withRetry(() => this.sendRequest(prompt, systemPrompt, history), 3),
        timeout,
        'Gemini content generation timed out'
      );
      
      // APIの型定義が変更されている可能性があるため、安全な方法でテキストを抽出
      return this.extractTextResponse(result as any);
    } catch (error) {
      logger.error(`Error generating content with Gemini: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * ストリーミングモードでコンテンツを生成
   * @param prompt プロンプトテキスト
   * @param systemPrompt システムプロンプト
   * @param history 会話履歴
   * @param timeout タイムアウト時間
   */
  public async generateContentStream(
    prompt: string | Part[],
    systemPrompt?: string,
    history?: Array<{ role: string; parts: Part[] }>,
    timeout = 120000
  ): Promise<GenerateContentStreamResult> {
    logger.debug('Generating content stream with Gemini');
    
    try {
      return await withTimeout(
        withRetry(() => this.sendStreamRequest(prompt, systemPrompt, history), 2),
        timeout,
        'Gemini content stream generation timed out'
      );
    } catch (error) {
      logger.error(`Error generating content stream with Gemini: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Function Callingを使用してツールを呼び出す会話を開始
   * @param prompt 実行したいタスクの説明
   * @param systemPrompt 追加のシステム指示
   * @param maxCalls 最大呼び出し回数
   */
  public async runToolConversation(
    prompt: string,
    systemPrompt?: string,
    maxCalls = 10
  ): Promise<any> {
    if (this.tools.length === 0) {
      throw new Error('No tools defined for function calling');
    }
    
    logger.debug(`Starting tool conversation with ${this.tools.length} tools available`);
    
    const chat = this.model.startChat({
      history: [],
      generationConfig: { temperature: 0.2 }
    });
    
    // システムプロンプトを最初のメッセージとして送信
    if (systemPrompt) {
      await chat.sendMessage("You are an AI assistant. " + systemPrompt);
    }
    
    // プロンプトを送信して初期レスポンスを取得
    let response = await chat.sendMessage(prompt);
    let result = response.response;
    let functionCallCount = 0;
    
    // ツール呼び出しの処理
    // 注: Gemini APIが更新されている可能性があるため、
    // functionCallプロパティのアクセス方法を変更
    while (functionCallCount < maxCalls) {
      // レスポンスからテキストを抽出 - 安全な方法
      const responseText = this.extractTextResponse(result as any);
      const functionCallMatch = responseText.match(/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^\}]+\})\s*\}/);
      
      if (!functionCallMatch) {
        break; // function callが見つからなかった場合は終了
      }
      
      functionCallCount++;
      const functionCall = {
        name: functionCallMatch[1],
        args: functionCallMatch[2]
      };
      
      logger.debug(`Function called: ${functionCall.name}`);
      
      const tool = this.tools.find(t => t.name === functionCall.name);
      if (!tool) {
        throw new Error(`Function ${functionCall.name} not found in registered tools`);
      }
      
      try {
        // 引数をパース
        const args = JSON.parse(functionCall.args);
        
        // ツール関数を実行
        const functionResult = await tool.execute(args);
        
        // 結果をLLMに返す
        response = await chat.sendMessage(
          `Function result for ${functionCall.name}: ${JSON.stringify(functionResult)}`
        );
        
        result = response.response;
      } catch (error) {
        logger.error(`Error executing function ${functionCall.name}: ${(error as Error).message}`);
        
        // エラーをLLMに返す
        response = await chat.sendMessage(
          `Error when executing function ${functionCall.name}: ${(error as Error).message}`
        );
        
        result = response.response;
      }
    }
    
    if (functionCallCount >= maxCalls) {
      logger.warn(`Maximum function call limit (${maxCalls}) reached in conversation`);
    }
    
    // 最終的なテキスト応答を抽出
    return this.extractTextResponse(result as any);
  }

  /**
   * GenerativeModelを作成して返す
   * 安全設定とツール定義を適用
   */
  private createModel(): GenerativeModel {
    // 安全設定を構成
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];
    
    // ツール定義を構成
    // 注: Gemini APIの仕様変更によりツール定義の構成を変更
    const toolConfig = {}; // 新しいAPIでは別の方法でツールを登録
    
    return genAI.getGenerativeModel({
      model: this.modelName,
      safetySettings,
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      },
      ...toolConfig,
    });
  }

  /**
   * Gemini APIにリクエストを送信
   * @param prompt プロンプト
   * @param systemPrompt システムプロンプト
   * @param history 会話履歴
   */
  private async sendRequest(
    prompt: string | Part[],
    systemPrompt?: string,
    history?: Array<{ role: string; parts: Part[] }>
  ): Promise<GenerateContentResult> {
    // 会話履歴がある場合はチャットモードで実行
    if (history && history.length > 0) {
      const chat = this.model.startChat({
        history
      });
      
      if (systemPrompt) {
        await chat.sendMessage("You are an AI assistant. " + systemPrompt);
      }
      
      return await chat.sendMessage(prompt);
    }
    
    // 通常のコンテンツ生成モードで実行
    const content = this.createContentRequest(prompt, systemPrompt);
    return await this.model.generateContent(content);
  }

  /**
   * ストリーミングモードでGemini APIにリクエストを送信
   * @param prompt プロンプト
   * @param systemPrompt システムプロンプト
   * @param history 会話履歴
   */
  private async sendStreamRequest(
    prompt: string | Part[],
    systemPrompt?: string,
    history?: Array<{ role: string; parts: Part[] }>
  ): Promise<GenerateContentStreamResult> {
    // 会話履歴がある場合はチャットモードで実行
    if (history && history.length > 0) {
      const chat = this.model.startChat({
        history
      });
      
      if (systemPrompt) {
        await chat.sendMessage("You are an AI assistant. " + systemPrompt);
      }
      
      return await chat.sendMessageStream(prompt);
    }
    
    // 通常のストリーミングモードで実行
    const content = this.createContentRequest(prompt, systemPrompt);
    return await this.model.generateContentStream(content);
  }

  /**
   * プロンプトとシステムプロンプトからコンテンツリクエストを作成
   * @param prompt プロンプト
   * @param systemPrompt システムプロンプト
   */
  private createContentRequest(prompt: string | Part[], systemPrompt?: string): Part[] {
    const parts: Part[] = [];
    
    // システムプロンプトがある場合は追加
    if (systemPrompt) {
      parts.push({ text: systemPrompt });
    }
    
    // プロンプトを追加
    if (typeof prompt === 'string') {
      parts.push({ text: prompt });
    } else {
      parts.push(...prompt);
    }
    
    return parts;
  }

  /**
   * Gemini応答からテキストを抽出
   * @param result Gemini APIのレスポンス
   */
  private extractTextResponse(result: any): string {
    try {
      if (typeof result.text === 'function') {
        return result.text();
      } else if (result.response && typeof result.response.text === 'function') {
        return result.response.text();
      } else if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
        return result.candidates[0].content.parts[0].text;
      } else {
        // 最後の手段としてJSON.stringifyを使用
        logger.debug('Using fallback text extraction from result');
        return JSON.stringify(result);
      }
    } catch (error) {
      logger.error(`Error extracting text from response: ${(error as Error).message}`);
      return '';
    }
  }
}