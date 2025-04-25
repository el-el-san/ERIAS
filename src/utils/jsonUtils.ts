/**
 * JSON文字列の一般的な構文エラーを修正するユーティリティ
 */

/**
 * JSON文字列を前処理して一般的な構文エラーを修正
 * - 配列内の末尾カンマを削除
 * - 不要な空白を削除
 * @param jsonString JSONの文字列
 * @returns 修正されたJSON文字列
 */
export function preprocessJsonString(jsonString: string): string {
  if (!jsonString) return jsonString;

  let processed = jsonString.replace(/,\s*([}\]])/g, '$1');

  while (processed.match(/,\s*([}\]])/)) {
    processed = processed.replace(/,\s*([}\]])/g, '$1');
  }


  return processed;
}

/**
 * 安全にJSONを解析するラッパー関数
 * @param jsonString JSONの文字列
 * @returns 解析されたJSONオブジェクト
 * @throws JSON解析エラー
 */
export function safeJsonParse<T>(jsonString: string): T {
  const preprocessed = preprocessJsonString(jsonString);
  
  try {
    return JSON.parse(preprocessed) as T;
  } catch (error) {
    const originalError = error as Error;
    
    let context = '';
    try {
      const match = originalError.message.match(/position (\d+)/);
      if (match && match[1]) {
        const position = parseInt(match[1], 10);
        const start = Math.max(0, position - 20);
        const end = Math.min(preprocessed.length, position + 20);
        context = `\nContext: "${preprocessed.substring(start, position)}->HERE<-${preprocessed.substring(position, end)}"`;
      }
    } catch (e) {
    }
    
    throw new Error(`JSON parse error: ${originalError.message}${context}`);
  }
}
