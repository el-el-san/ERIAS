import logger from './logger';

/**
 * 指定された時間待機するPromiseを返す
 * @param ms 待機時間（ミリ秒）
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Promiseをタイムアウト付きで実行する
 * @param promise 実行するPromise
 * @param timeoutMs タイムアウト時間（ミリ秒）
 * @param errorMessage タイムアウト時のエラーメッセージ
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

/**
 * リトライロジック付きでPromiseを実行する
 * @param fn 実行する関数（Promiseを返す）
 * @param retries リトライ回数
 * @param delayMs リトライ間の待機時間（ミリ秒）
 * @param backoff バックオフ係数（待機時間の増加率）
 * @param onRetry リトライ時に実行するコールバック
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000,
  backoff = 2,
  onRetry?: (error: Error, attempt: number) => void
): Promise<T> => {
  let lastError: Error = new Error('Unknown error');
  let attempt = 0;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      attempt++;

      if (attempt > retries) {
        break;
      }

      if (onRetry) {
        onRetry(lastError, attempt);
      } else {
        logger.debug(`Operation failed, retrying (${attempt}/${retries}): ${lastError.message}`);
      }

      // 待機時間を計算（エクスポネンシャルバックオフ）
      const delay = delayMs * Math.pow(backoff, attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError;
};

/**
 * 複数のPromiseを並列実行し、部分的な失敗を許容する
 * @param tasks 実行するPromiseを返す関数の配列
 * @param concurrency 同時並列数
 */
export const runConcurrentTasks = async <T>(
  tasks: (() => Promise<T>)[],
  concurrency = 5
): Promise<{ results: T[]; errors: Error[] }> => {
  const results: T[] = [];
  const errors: Error[] = [];
  let index = 0;

  // 同時に実行する関数を管理
  const runBatch = async (): Promise<void> => {
    while (index < tasks.length) {
      const currentIndex = index++;
      const task = tasks[currentIndex];
      
      try {
        const result = await task();
        results.push(result);
      } catch (err) {
        errors.push(err as Error);
        logger.error(`Task ${currentIndex} failed: ${(err as Error).message}`);
      }
    }
  };

  // 指定された並列数でバッチを実行
  const batchPromises: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    batchPromises.push(runBatch());
  }

  await Promise.all(batchPromises);

  return { results, errors };
};
