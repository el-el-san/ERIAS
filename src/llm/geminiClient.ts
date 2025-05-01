import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content } from '@google/generative-ai';
import { logError } from '../utils/logger';
import { config } from '../config/config';
import { withRetry } from '../utils/asyncUtils';
import { ConversationMessage } from './conversationManager';

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
    apiKey: string = config.GOOGLE_API_KEY,
    model: string = config.DEFAULT_MODEL
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
   * @param history 会話履歴（オプション）
   */
  public async generateContent(
    prompt: string,
    systemPrompt?: string,
    temperature: number = 0.7,
    timeout: number = 30000,
    history?: ConversationMessage[]
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
          
          // 会話履歴があれば変換して追加
          const contents: Content[] = [];
          
          // システムプロンプトがあれば先頭に追加
          if (systemPrompt) {
            contents.push({
              role: 'user',
              parts: [{ text: systemPrompt }]
            });
            
            contents.push({
              role: 'model',
              parts: [{ text: 'ご指示を理解しました。これからの会話でそれに基づいて対応します。' }]
            });
          }
          
          // 会話履歴を追加
          if (history && history.length > 0) {
            for (const message of history) {
              contents.push({
                role: message.role === 'user' ? 'user' : 'model',
                parts: [{ text: message.content }]
              });
            }
          }
          
          // 現在のユーザーメッセージを追加
          contents.push({
            role: 'user',
            parts: [{ text: prompt }]
          });
          
          // Gemini APIリクエスト
          const response = await Promise.race([
            generativeModel.generateContent({
              contents,
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
      logError(String(error), 'Gemini API error:');
      throw error;
    }
  }

  /**
   * ツールを使用した会話型レスポンス生成
   * @param prompt 入力プロンプト
   * @param systemPrompt システムプロンプト（指示）
   * @param temperature 温度パラメータ（0.0〜1.0、高いほど多様な出力）
   * @param timeout タイムアウト（ミリ秒）
   * @param history 会話履歴（オプション）
   */
  public async runToolConversation(
    prompt: string,
    systemPrompt?: string,
    temperature: number = 0.7,
    timeout: number = 60000,
    history?: ConversationMessage[]
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
          
          // 会話履歴があれば変換して追加
          const contents: Content[] = [];
          
          // システムプロンプトがあれば先頭に追加
          if (systemPrompt) {
            contents.push({
              role: 'user',
              parts: [{ text: systemPrompt }]
            });
            
            contents.push({
              role: 'model',
              parts: [{ text: 'ご指示を理解しました。これからの会話でそれに基づいて対応します。' }]
            });
          }
          
          // 会話履歴を追加
          if (history && history.length > 0) {
            for (const message of history) {
              contents.push({
                role: message.role === 'user' ? 'user' : 'model',
                parts: [{ text: message.content }]
              });
            }
          }
          
          // 現在のユーザーメッセージを追加
          contents.push({
            role: 'user',
            parts: [{ text: prompt }]
          });
          
          // Gemini APIリクエスト
          const response = await Promise.race([
            generativeModel.generateContent({
              contents,
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
      logError(String(error), 'Gemini API error in tool conversation:');
      throw error;
    }
  }

  /**
   * ストリーミングテキスト生成
   * @param prompt 入力プロンプト
   * @param callback ストリーミング応答の各チャンクを処理するコールバック関数
   * @param systemPrompt システムプロンプト（指示）
   * @param temperature 温度パラメータ（0.0〜1.0、高いほど多様な出力）
   * @param timeout タイムアウト（ミリ秒）
   * @param history 会話履歴（オプション）
   */
  public async generateContentStream(
    prompt: string,
    callback: (chunk: string, isComplete: boolean) => Promise<void>,
    systemPrompt?: string,
    temperature: number = 0.7,
    timeout: number = 30000,
    history?: ConversationMessage[]
  ): Promise<string> {
    try {
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
      
      // 会話履歴があれば変換して追加
      const contents: Content[] = [];
      
      // システムプロンプトがあれば先頭に追加
      if (systemPrompt) {
        contents.push({
          role: 'user',
          parts: [{ text: systemPrompt }]
        });
        
        contents.push({
          role: 'model',
          parts: [{ text: 'ご指示を理解しました。これからの会話でそれに基づいて対応します。' }]
        });
      }
      
      // 会話履歴を追加
      if (history && history.length > 0) {
        for (const message of history) {
          contents.push({
            role: message.role === 'user' ? 'user' : 'model',
            parts: [{ text: message.content }]
          });
        }
      }
      
      // 現在のユーザーメッセージを追加
      contents.push({
        role: 'user',
        parts: [{ text: prompt }]
      });
      
      // Gemini APIストリーミングリクエスト
      const result = await generativeModel.generateContentStream({
        contents,
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
      });
      
      let fullResponse = '';
      
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        await callback(chunkText, false);
      }
      
      await callback('', true);
      
      return fullResponse;
    } catch (error) {
      logError(String(error), 'Gemini API streaming error:');
      throw error;
    }
  }
}
