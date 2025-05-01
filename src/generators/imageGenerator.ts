import { writeFile } from 'fs/promises';
import { AttachmentBuilder } from 'discord.js';
import logger from '../utils/logger';
import { logError } from '../utils/logger';
import { GoogleGeminiConfig } from './types';
import { config } from '../config/config';
import { GeminiClient } from '../llm/geminiClient';

// 動的インポートを使用して利用可能なパッケージを選択
let GenerativeAI: any;

export class ImageGenerator {
  private ai: any;
  private usingNewApi: boolean = false;
  private initialized: boolean = false;
  private geminiClient: GeminiClient;

  constructor(aiConfig?: GoogleGeminiConfig) {
    // 設定が渡されなかった場合はグローバル設定を使用
    const configToUse = aiConfig || {
      apiKey: config.GOOGLE_API_KEY,
      model: config.DEFAULT_MODEL || 'gemini-2.0-flash-exp'
    };
    
    // 初期化時に利用可能なパッケージを判断
    this.initializeAI(configToUse);
    this.geminiClient = new GeminiClient();
  }

  private async initializeAI(config: GoogleGeminiConfig) {
    try {
      // まず新しいAPIを試す
      const { GoogleGenAI } = await import('@google/genai');
      this.ai = new GoogleGenAI({ apiKey: config.apiKey });
      this.usingNewApi = true;
      this.initialized = true;
      logger.info('Successfully initialized @google/genai for image generation');
    } catch (err) {
      try {
        // フォールバック: 従来のAPIを使用
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        this.ai = new GoogleGenerativeAI(config.apiKey);
        this.usingNewApi = false;
        this.initialized = true;
        logger.info('Using @google/generative-ai as fallback (note: image generation may not be supported)');
      } catch (err2) {
        logError('Failed to initialize Google AI SDK: ' + String(err2));
        throw new Error('Neither @google/genai nor @google/generative-ai could be loaded');
      }
    }
  }

  /**
   * 画像生成リクエストを検出
   */
  detectImageRequest(message: string): boolean {
    const imagePatterns = [
      /画像を生成/i,
      /イメージを生成/i,
      /generate.*image/i,
      /create.*image/i,
      /画像を作/i,
      /イメージを作/i
    ];
    
    return imagePatterns.some(pattern => pattern.test(message));
  }

  /**
   * プロンプトを最適化
   */
  private async optimizePrompt(userRequest: string): Promise<string> {
    // ユーザーが明示的に直接入力を希望している場合はそのまま使用
    if (userRequest.toLowerCase().includes('直接入力') || userRequest.toLowerCase().includes('そのまま')) {
      return userRequest.replace(/画像を生成|イメージを生成|generate.*image|create.*image|画像を作|イメージを作|直接入力|そのまま/gi, '').trim();
    }

    // GeminiのLLMを使用してプロンプトを強化
    const systemPrompt = `You are a prompt engineer specialized in generating high-quality image prompts. 
Your task is to transform the user's request into a detailed, descriptive prompt for image generation.

Important rules:
1. Enhance details, add artistic style, lighting, composition
2. Keep the core idea from the user's request
3. Make it descriptive but concise
4. Add relevant technical terms for image generation
5. Return ONLY the enhanced prompt, no explanations

Example:
User: "猫の画像を作って"
Enhanced: "A cute silver tabby cat with bright green eyes, sitting elegantly on a windowsill with soft morning sunlight, photorealistic style, 4k quality, shallow depth of field"`;

    try {
      // 画像生成に関連する部分を抽出
      const cleanedRequest = userRequest
        .replace(/画像を生成|イメージを生成|generate.*image|create.*image|画像を作|イメージを作/gi, '')
        .trim();

      const enhancedPrompt = await this.geminiClient.generateContent(
        cleanedRequest,
        systemPrompt,
        0.7,
        30000
      );

      logger.info('Prompt enhanced by LLM', { 
        original: cleanedRequest, 
        enhanced: enhancedPrompt 
      });

      return enhancedPrompt.trim();
    } catch (error) {
      logger.warn('Failed to enhance prompt with LLM, using fallback', { error });
      // フォールバック: 基本的な強化
      const cleanedRequest = userRequest
        .replace(/画像を生成|イメージを生成|generate.*image|create.*image|画像を作|イメージを作/gi, '')
        .trim();
      
      return `Create a high-quality, detailed image of: ${cleanedRequest}`;
    }
  }

  /**
   * 画像を生成
   */
  async generateImage(userRequest: string): Promise<Buffer> {
    try {
      if (!this.initialized) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!this.initialized) {
          throw new Error('Image generator not initialized');
        }
      }

      logger.info('Image generation requested', { request: userRequest, usingNewApi: this.usingNewApi });
      
      const optimizedPrompt = await this.optimizePrompt(userRequest);
      logger.debug('Optimized prompt', { prompt: optimizedPrompt });

      let response;
      
      if (this.usingNewApi) {
        // 新しいAPI: @google/genai
        response = await this.ai.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: optimizedPrompt,
          config: {
            responseModalities: ["TEXT", "IMAGE"]
          }
        });
      } else {
        // 従来のAPI: @google/generative-ai
        // 画像生成は直接サポートされていないため、エラーメッセージを返す
        throw new Error('画像生成は@google/genaiパッケージが必要です。現在@google/generative-aiを使用しています。');
      }

      // レスポンスを処理
      const candidates = response.response?.candidates || response.candidates;
      
      if (candidates?.[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData) {
            const buffer = Buffer.from(part.inlineData.data || '', 'base64');
            const fileName = `generated_${Date.now()}.png`;
            
            // ファイルに保存（必要なら残す）
            await writeFile(`./uploads/${fileName}`, buffer);
            
            // Bufferとして返す
            return buffer;
          }
        }
      }

      throw new Error('画像の生成に失敗しました');
    } catch (error) {
      logError('Failed to generate image: ' + String(error));
      throw error;
    }
  }
}
