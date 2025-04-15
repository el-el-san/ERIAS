import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import logger from '../utils/logger';
import config from '../config/config';
import { withRetry } from '../utils/asyncUtils';

/**
 * Google Gemini APIクライアント
 */
export class GeminiClient {
  private client: GoogleGenerativeAI;
  private model: string;
  
  /**
   * GeminiClientを初期化
   * @param apiKey APIキー（指定がない場合は環境変数から読み込み）
   * @param model 使用するモデル（指定がない場合は環境変数から読み込み）
   */
  constructor(
    apiKey: string = config.llm.google.apiKey,
    model: string = config.llm.google.defaultModel
  ) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }
  
  /**
   * テキスト生成
   * @param prompt 入力プロンプト
   * @param systemPrompt システムプロンプト（指示）
   * @param temperature 温度パラメータ（0.0〜1.0、高いほど多様な出力）
   * @param timeout タイムアウト（ミリ秒）
   */
  public async generateContent(
    prompt: string,
    systemPrompt?: string,
    temperature: number = 0.7,
    timeout: number = 30000
  ): Promise<string> {
    try {
      // リトライ付きで実行
      return await withRetry(
        async () => {
          const generativeModel = this.client.getGenerativeModel({
            model: this.model,
          });
          
          // 生成パラメータ
          const generationConfig = {
            temperature,
            topK: 16,
            topP: 0.95,
            maxOutputTokens: 8192,
          };
          
          // Gemini APIリクエスト
          const response = await Promise.race([
            generativeModel.generateContent({
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt }
                  ]
                }
              ],
              generationConfig,
              safetySettings: [
                {
                  category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                  category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                  category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                  category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                }
              ]
            }),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Gemini API request timed out after ${timeout}ms`)), timeout);
            })
          ]);
          
          // 応答をテキストに変換
          const responseText = response.response.text();
          return responseText;
        },
        3, // 最大リトライ回数
        2000, // 初期遅延（ミリ秒）
        2 // 指数バックオフ係数
      );
    } catch (error) {
      logger.error(`Gemini API error: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * ツールを使用した会話型レスポンス生成
   * @param prompt 入力プロンプト
   * @param systemPrompt システムプロンプト（指示）
   * @param temperature 温度パラメータ（0.0〜1.0、高いほど多様な出力）
   * @param timeout タイムアウト（ミリ秒）
   */
  public async runToolConversation(
    prompt: string,
    systemPrompt?: string,
    temperature: number = 0.7,
    timeout: number = 60000
  ): Promise<string> {
    try {
      // リトライ付きで実行
      return await withRetry(
        async () => {
          const generativeModel = this.client.getGenerativeModel({
            model: this.model,
          });
          
          // 生成パラメータ
          const generationConfig = {
            temperature,
            topK: 16,
            topP: 0.95,
            maxOutputTokens: 8192,
          };
          
          // Gemini APIリクエスト
          const response = await Promise.race([
            generativeModel.generateContent({
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt }
                  ]
                }
              ],
              generationConfig,
              safetySettings: [
                {
                  category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                  category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                  category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                  category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                  threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                }
              ]
            }),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Gemini API request timed out after ${timeout}ms`)), timeout);
            })
          ]);
          
          // 応答をテキストに変換
          const responseText = response.response.text();
          return responseText;
        },
        3, // 最大リトライ回数
        2000, // 初期遅延（ミリ秒）
        2 // 指数バックオフ係数
      );
    } catch (error) {
      logger.error(`Gemini API error in tool conversation: ${(error as Error).message}`);
      throw error;
    }
  }
}
