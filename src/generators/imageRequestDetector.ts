/**
 * 画像生成リクエスト検出
 * メッセージから画像生成リクエストを検出して生成内容を抽出
 */
import { PlatformMessage } from '../platforms/types';
import { logger } from '../tools/logger';

export class ImageRequestDetector {
  /**
   * 画像生成リクエストの検出
   * @param message プラットフォームメッセージ
   * @returns 画像生成プロンプト（リクエストでない場合はnull）
   */
  detectImageRequest(message: PlatformMessage): string | null {
    try {
      // 複数言語に対応した画像生成リクエスト検出パターン
      const patterns = [
        // 日本語パターン
        /(?:(.+?)の(?:画像|イメージ)を(?:生成|作成|作って))/i,
        /(?:(?:画像|イメージ)を(?:生成|作成|作って)(?:ください)?(?:.*?)：(.*?)(?:$|\.|。))/i,
        /(?:(?:画像|イメージ)を(?:生成|作成|作って)(?:ください)?(?:.*?)「(.*?)」)/i,
        /(?:「(.*?)」の(?:画像|イメージ)を(?:生成|作成|作って))/i,
        
        // 英語パターン
        /(?:generate(?:\s+an)?(?:\s+image)?\s+of\s+(.+?)(?:$|\.|。))/i,
        /(?:create(?:\s+an)?(?:\s+image)?\s+of\s+(.+?)(?:$|\.|。))/i,
        /(?:make(?:\s+an)?(?:\s+image)?\s+of\s+(.+?)(?:$|\.|。))/i,
        /(?:(?:an\s+)?image\s+of\s+(.+?)(?:$|\.|。))/i,
        /(?:draw(?:\s+me)?(?:\s+an)?(?:\s+image)?\s+of\s+(.+?)(?:$|\.|。))/i,
        /(?:show(?:\s+me)?(?:\s+an)?(?:\s+image)?\s+of\s+(.+?)(?:$|\.|。))/i
      ];
      
      for (const pattern of patterns) {
        const match = message.content.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error detecting image request:', error);
      return null;
    }
  }
  
  /**
   * プロンプトの最適化
   * @param rawPrompt 生のプロンプト
   * @returns 最適化されたプロンプト
   */
  optimizePrompt(rawPrompt: string): string {
    // プロンプトを最適化するロジック
    // 例：追加の説明や高品質化のための指示を追加
    
    let optimizedPrompt = rawPrompt;
    
    // 詳細な説明が少ない場合は、高品質化のための指示を追加
    if (rawPrompt.split(' ').length < 5) {
      optimizedPrompt += ', high quality, detailed, high resolution, photorealistic';
    }
    
    // 日本語のプロンプトの場合、英語への翻訳も考慮
    if (/[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef\u3040-\u309f]/.test(optimizedPrompt)) {
      // 日本語文字が含まれている場合、日本語版の追加パラメータを付加
      if (!optimizedPrompt.includes('高品質') && 
          !optimizedPrompt.includes('詳細') && 
          !optimizedPrompt.includes('高解像度')) {
        optimizedPrompt += ', 高品質, 詳細, 高解像度, 写実的';
      }
    }
    
    // スタイルキーワードが含まれていない場合、デフォルトのスタイルを追加
    const styleKeywords = [
      'photorealistic', 'anime', 'cartoon', 'sketch', 'painting', '3d', 'digital art',
      '写実的', 'アニメ', '漫画', 'スケッチ', '絵画', 'デジタルアート'
    ];
    
    const hasStyleKeyword = styleKeywords.some(keyword => 
      optimizedPrompt.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (!hasStyleKeyword) {
      // デフォルトで高品質なデジタルアートスタイルを追加
      optimizedPrompt += ', digital art style, vivid colors, intricate details';
    }
    
    return optimizedPrompt;
  }
}
