/**
 * Google Gemini APIの設定インターフェース
 */
export interface GoogleGeminiConfig {
  apiKey: string;
  model: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeout?: number;
}
