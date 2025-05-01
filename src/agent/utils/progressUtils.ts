/**
 * 進捗管理ユーティリティ
 */
import { ProjectStatus } from '../../types/agentTypes';
import { TaskStatus } from '../../core/types';

/**
 * プログレスバーの生成
 */
export function generateProgressBar(progress: number, length: number = 20): string {
  const filledLength = Math.round(length * progress);
  const emptyLength = length - filledLength;
  
  const filledPart = '█'.repeat(filledLength);
  const emptyPart = '░'.repeat(emptyLength);
  
  return `[${filledPart}${emptyPart}]`;
}

/**
 * ProjectStatusからTaskStatusの状態への変換
 */
export function mapProjectStatusToTaskState(status: ProjectStatus): TaskStatus['state'] {
  switch (status) {
    case ProjectStatus.PENDING:
    case ProjectStatus.PLANNING:
      return 'planning';
    case ProjectStatus.CODING:
      return 'coding';
    case ProjectStatus.TESTING:
      return 'testing';
    case ProjectStatus.DEBUGGING:
      return 'debugging';
    case ProjectStatus.COMPLETED:
      return 'complete';
    case ProjectStatus.FAILED:
      return 'failed';
    case ProjectStatus.CANCELLED:
      return 'canceled';
    default:
      return 'planning';
  }
}

/**
 * ProjectStatusから進捗率の計算
 */
export function calculateProgressFromStatus(status: ProjectStatus): number {
  switch (status) {
    case ProjectStatus.PENDING:
      return 0.0;
    case ProjectStatus.PLANNING:
      return 0.2;
    case ProjectStatus.CODING:
      return 0.5;
    case ProjectStatus.TESTING:
      return 0.8;
    case ProjectStatus.DEBUGGING:
      return 0.9;
    case ProjectStatus.COMPLETED:
      return 1.0;
    case ProjectStatus.FAILED:
    case ProjectStatus.CANCELLED:
      return 1.0;
    default:
      return 0.0;
  }
}
