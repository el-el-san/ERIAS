import { ProjectTask, ErrorInfo, Debugger } from '../agent/types.js';
import logger from '../utils/logger.js';

/**
 * デバッガークラス
 * エラーを解析し修正する
 */
export class DebuggerImpl implements Debugger {
  /**
   * エラーを分析し、修正案を適用
   * @param task プロジェクトタスク
   * @param errorInfo エラー情報
   */
  public async fixError(task: ProjectTask, errorInfo: ErrorInfo): Promise<boolean> {
    logger.info(`[MOCK] Fixing error in project ${task.id}: ${errorInfo.message}`);
    
    // エラー修正をシミュレート
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 修正成功を返す
    return true;
  }
}
