/**
 * Promiseにタイムアウトを設定する
 * @param promise タイムアウトを設定するPromise
 * @param timeoutMs タイムアウト時間（ミリ秒）
 * @param errorMessage タイムアウト時のエラーメッセージ
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  // タイムアウト用のPromise
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });
  
  try {
    // 元のPromiseとタイムアウトPromiseを競争させる
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    // タイムアウトタイマーをクリア
    clearTimeout(timeoutId!);
  }
}

/**
 * 指定された回数リトライする
 * @param fn 実行する非同期関数
 * @param maxRetries 最大リトライ回数
 * @param delay リトライ間の遅延（ミリ秒）
 * @param backoff 指数バックオフの係数（1より大きい場合は指数バックオフを適用）
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  backoff: number = 2
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        // 次のリトライまで待機
        const waitTime = delay * Math.pow(backoff, attempt);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError;
}

/**
 * 複数のPromiseを並列実行し、すべての結果を配列で返す
 * エラーが発生しても処理を継続し、結果とエラーを分けて返す
 * @param promises 実行するPromiseの配列
 */
export async function allSettledWithResults<T>(
  promises: Promise<T>[]
): Promise<{results: T[]; errors: Error[]}> {
  const results: T[] = [];
  const errors: Error[] = [];
  
  const settled = await Promise.allSettled(promises);
  
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      errors.push(result.reason);
    }
  }
  
  return { results, errors };
}
