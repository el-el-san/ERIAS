/**
 * プロジェクトの状態を表す列挙型
 */
export enum ProjectStatus {
  PENDING = 'pending',       // 初期状態
  PLANNING = 'planning',     // 計画立案中
  CODING = 'coding',         // コーディング中
  TESTING = 'testing',       // テスト中
  DEBUGGING = 'debugging',   // デバッグ中
  COMPLETED = 'completed',   // 完了
  FAILED = 'failed',         // 失敗
  CANCELLED = 'cancelled',   // キャンセル
  IN_PROGRESS = 'in_progress', // 処理中
}

/**
 * タスクフェーズを表す型
 */
export type TaskPhase = 'planning' | 'coding' | 'testing' | 'debugging';

/**
 * タスク進捗状況の型
 */
export interface TaskProgress {
  planning: number;
  coding: number;
  testing: number;
  debugging: number;
  overall: number;
  currentPhase?: TaskPhase;
  message?: string;
}

/**
 * ファイル情報の型
 */
export interface FileInfo {
  path: string;
  description: string;
  content?: string;
  status: 'pending' | 'generated' | 'modified' | 'error' | 'updated';
  dependencies?: string[];
  needsUpdate?: boolean;
}

/**
 * 開発計画の型
 */
export interface DevelopmentPlan {
  projectDescription: string;
  technicalStack: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    testing?: string[];
    other?: string[];
  };
  dependencies: {
    production: string[];
    development: string[];
  };
  files: FileInfo[];
  steps: {
    description: string;
    status: 'pending' | 'completed' | 'error';
  }[];
  requiresDependencyUpdate?: boolean;
}

/**
 * エラー情報の型
 */
export interface ErrorInfo {
  type: 'compilation' | 'runtime' | 'test' | 'other';
  message: string;
  stackTrace?: string;
  filePath?: string;
  lineNumber?: number;
  timeStamp: number;
  attempts: number;
}

/**
 * フィードバックの緊急度を表す型
 */
export type FeedbackUrgency = 'normal' | 'critical' | 'high' | 'low';

/**
 * フィードバックの優先度を表す型
 */
export type FeedbackPriority = 'normal' | 'high' | 'low';

/**
 * フィードバックの種類を表す型
 */
export type FeedbackType = 'general' | 'plan' | 'code' | 'feature' | 'fix';

/**
 * フィードバックのステータスを表す型
 */
export type FeedbackStatus = 'pending' | 'processing' | 'applied' | 'rejected' | 'completed';

/**
 * ユーザーフィードバックの型
 */
export interface UserFeedback {
  id: string;
  taskId: string;
  timestamp: number;
  content: string;
  priority: FeedbackPriority;
  urgency: FeedbackUrgency;
  type: FeedbackType;
  targetFile?: string;
  status: FeedbackStatus;
  appliedPhase?: string;
}

/**
 * フィードバックキューの型
 */
export interface FeedbackQueue {
  taskId: string;
  feedbacks: UserFeedback[];
  lastProcessedIndex: number;
}

/**
 * テスト結果の型
 */
export interface TestResult {
  success: boolean;
  output: string;
  errors?: string[];
}

/**
 * GitHubリポジトリ情報の型
 */
export interface GitHubRepoInfo {
  name: string;
  fullName: string;
  description: string;
  owner: {
    login: string;
    type: string;
  };
  defaultBranch: string;
  language: string;
  hasIssues: boolean;
  hasProjects: boolean;
  hasWiki: boolean;
  createdAt: string;
  updatedAt: string;
  size: number;
  topics: string[];
}

/**
 * GitHubタスク実行オプションの型
 */
export interface GitHubTaskOptions {
  createPullRequest?: boolean;
  baseBranch?: string;
  skipTests?: boolean;
}

/**
 * プロジェクトタスクの型
 */
export interface ProjectTask {
  id: string;
  userId?: string;
  guildId?: string;
  channelId?: string;
  specification?: string;
  status: ProjectStatus;
  type: 'project' | 'github';
  plan?: DevelopmentPlan;
  errors?: ErrorInfo[];
  startTime?: number;
  endTime?: number;
  projectPath?: string;
  lastProgressUpdate?: number;
  currentAction?: string;
  feedbackQueue?: FeedbackQueue;
  hasCriticalFeedback?: boolean;
  additionalInstructions?: string;
  requiresRecoding?: boolean;
  currentContextualFeedback?: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  progress: TaskProgress;
  resultUrl?: string;
  errorMessage?: string;
  feedback?: UserFeedback[];
  // GitHub関連情報
  repoUrl?: string;
  repoOwner?: string;
  repoName?: string;
  repoBranch?: string;
  repoTask?: string;
  pullRequestUrl?: string;
}

/**
 * 外部に公開されるプロジェクト情報の型
 */
export interface ProjectInfo {
  id: string;
  status: ProjectStatus;
  type: 'project' | 'github';
  specification?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  progress: TaskProgress;
  resultUrl?: string;
  errorMessage?: string;
  pullRequestUrl?: string;
}

/**
 * 進捗イベントリスナー関数の型
 */
export type ProgressListener = (task: ProjectTask, message: string, isPartial?: boolean) => Promise<void>;

/**
 * 進捗通知関数の型
 */
export type ProgressNotifier = (task: ProjectTask, message: string) => Promise<void>;

/**
 * プロンプト種別に応じたテンプレート変数
 */
export interface PromptVariables {
  projectName?: string;
  projectDescription?: string;
  currentTime?: string;
  specification?: string;
  contextFiles?: string;
  filePath?: string;
  fileDescription?: string;
  relatedCode?: string;
  codingStandards?: string;
  errorMessage?: string;
  errorCode?: string;
  stackTrace?: string;
  testCode?: string;
  attemptCount?: number;
}

/**
 * プランナーモジュールのインターフェース
 */
export interface Planner {
  createPlan(task: ProjectTask): Promise<DevelopmentPlan>;
  adjustPlan(task: ProjectTask, feedback: string): Promise<DevelopmentPlan>;
  refactorPlan(task: ProjectTask, processingPrompt: string): Promise<DevelopmentPlan>;
}

/**
 * コーダーモジュールのインターフェース
 */
export interface Coder {
  generateFile(task: ProjectTask, fileInfo: FileInfo): Promise<string>;
  installDependencies(task: ProjectTask): Promise<boolean>;
  regenerateFile(task: ProjectTask, fileInfo: FileInfo, existingContent: string): Promise<string>;
  adjustFileWithFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean>;
  addFeatureFromFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean>;
}

/**
 * テスターモジュールのインターフェース
 */
export interface Tester {
  runTests(task: ProjectTask): Promise<TestResult>;
  setupTestingTools(task: ProjectTask): void;
}

/**
 * デバッガーモジュールのインターフェース
 */
export interface Debugger {
  fixError(task: ProjectTask, errorInfo: ErrorInfo): Promise<boolean>;
}

/**
 * 通知ファイルの型
 */
export interface NotificationFile {
  path: string;
  name: string;
  mimeType: string;
  size?: number;
  [key: string]: any;
}

/**
 * 通知ペイロードの型
 */
export interface NotificationPayload {
  text?: string;
  files?: NotificationFile[];
}

/**
 * プラットフォーム種別
 */
export enum PlatformType {
  DISCORD = 'discord',
  SLACK = 'slack',
}

/**
 * 通知ターゲット情報
 */
export interface NotificationTarget {
  userId: string;
  platformType: PlatformType;
  channelId: string;
}

/**
 * GitHub連携機能の共通型定義
 */
export interface GitHubServiceOptions {
  token?: string;
  workDir?: string;
  owner?: string;
  repo?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface FeatureImplementationResult {
  files: string[];
  message: string;
}

export interface PullRequestResult {
  url: string;
  number: number;
}

export interface ChangedFile {
  path: string;
  changes: string;
}

export interface RepositoryContext {
  owner: string;
  repo: string;
  repoPath: string;
  analysisResult?: any; // RepoAnalysisResult型は必要に応じてimport
}

export interface ReviewComment {
  filePath: string;
  line: number;
  comment: string;
}
/**
 * タスク状態の型定義（core/types.tsより移動）
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
 * フィードバックオプションの型定義（core/types.tsより移動）
 */
export interface FeedbackOptions extends NotificationTarget {
  isUrgent?: boolean;
  isFeature?: boolean;
  isFix?: boolean;
  isCode?: boolean;
  filePath?: string;
}

