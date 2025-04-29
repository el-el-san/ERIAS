/**
 * Agent関連の型定義
 */
import { ProjectStatus, ProjectTask, UserFeedback } from '../types';
import { NotificationTarget } from '../../platforms/types';

/**
 * タスク状態の型定義
 */
export interface TaskStatus {
  id: string;
  state: 'planning' | 'coding' | 'testing' | 'debugging' | 'complete' | 'canceled' | 'failed';
  progress: number;
  startTime: Date;
  endTime?: Date;
  description?: string;
}

/**
 * フィードバックオプションの型定義
 */
export interface FeedbackOptions extends NotificationTarget {
  isUrgent?: boolean;
  isFeature?: boolean;
  isFix?: boolean;
  isCode?: boolean;
  filePath?: string;
}

/**
 * 進捗通知関数の型定義
 */
export type ProgressNotifier = (task: ProjectTask, message: string) => Promise<void>;
