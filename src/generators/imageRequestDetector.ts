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
        
        // 英語パターン
        /(?:generate(?:\s+an)?(?:\s+image)?\s+of\s+(.+?)(?:$|\.|。))/i,
        /(?:create(?:\s+an)?(?:\s+image)?\s+of\s+(.+?)(?:$|\.|。))/i,
        /(?:make(?:\s+an)?(?:\s+image)?\s+of\s+(.+?)(?:$|\.|。))/i,
        /(?:(?:an\s+)?image\s+of\s+(.+?)(?:$|\.|。))/i
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
      optimizedPrompt += ', high quality, detailed';
    }
    
    return optimizedPrompt;
  }
}
