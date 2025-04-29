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
  planning: number;    // 0-1 の範囲で計画フェーズの進捗
  coding: number;      // 0-1 の範囲でコーディングフェーズの進捗
  testing: number;     // 0-1 の範囲でテストフェーズの進捗
  debugging: number;   // 0-1 の範囲でデバッグフェーズの進捗
  overall: number;     // 0-1 の範囲で全体の進捗
  currentPhase?: TaskPhase; // 現在のフェーズ
  message?: string;    // 進捗メッセージ
}

/**
 * ファイル情報の型
 */
export interface FileInfo {
  path: string;              // ファイルパス
  description: string;       // ファイルの説明
  content?: string;          // ファイルの内容（未生成の場合はundefined）
  status: 'pending' | 'generated' | 'modified' | 'error' | 'updated'; // ファイルの状態
  dependencies?: string[];   // 依存ファイル（あれば）
  needsUpdate?: boolean;     // フィードバックにより更新が必要
}

/**
 * 開発計画の型
 */
export interface DevelopmentPlan {
  projectDescription: string;            // プロジェクトの説明
  technicalStack: {                      // 技術スタック
    frontend?: string[];                 // フロントエンド技術
    backend?: string[];                  // バックエンド技術
    database?: string[];                 // データベース技術
    testing?: string[];                  // テスト技術
    other?: string[];                    // その他技術
  };
  dependencies: {                        // 依存関係
    production: string[];                // 本番環境用依存パッケージ
    development: string[];               // 開発環境用依存パッケージ
  };
  files: FileInfo[];                     // 生成するファイル一覧
  steps: {                               // 実行ステップ
    description: string;                 // ステップの説明
    status: 'pending' | 'completed' | 'error'; // ステップの状態
  }[];
  requiresDependencyUpdate?: boolean;    // 依存関係の更新が必要
}

/**
 * エラー情報の型
 */
export interface ErrorInfo {
  type: 'compilation' | 'runtime' | 'test' | 'other'; // エラーの種類
  message: string;                       // エラーメッセージ
  stackTrace?: string;                   // スタックトレース（あれば）
  filePath?: string;                     // エラー発生ファイル（あれば）
  lineNumber?: number;                   // エラー発生行（あれば）
  timeStamp: number;                     // エラー発生時刻
  attempts: number;                      // 修正試行回数
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
  id: string;                           // フィードバックID
  taskId: string;                       // タスクID
  timestamp: number;                    // 受信時刻
  content: string;                      // フィードバック内容
  priority: FeedbackPriority;           // 優先度
  urgency: FeedbackUrgency;             // 緊急度
  type: FeedbackType;                   // フィードバックの種類
  targetFile?: string;                  // 対象ファイル（あれば）
  status: FeedbackStatus;               // 状態
  appliedPhase?: string;                // 適用されたフェーズ
}

/**
 * フィードバックキューの型
 */
export interface FeedbackQueue {
  taskId: string;                       // タスクID
  feedbacks: UserFeedback[];            // フィードバック一覧
  lastProcessedIndex: number;           // 最後に処理したインデックス
}

/**
 * テスト結果の型
 */
export interface TestResult {
  success: boolean;                     // テスト成功フラグ
  output: string;                       // テスト出力
  errors?: string[];                    // エラー一覧（あれば）
}

/**
 * GitHub関連の追加型定義
 */

/**
 * GitHubリポジトリ情報の型
 */
export interface GitHubRepoInfo {
  name: string;                         // リポジトリ名
  fullName: string;                     // 完全なリポジトリ名（owner/repo）
  description: string;                  // リポジトリの説明
  owner: {
    login: string;                      // オーナーログイン名
    type: string;                       // オーナータイプ（User/Organization）
  };
  defaultBranch: string;                // デフォルトブランチ名
  language: string;                     // 主要言語
  hasIssues: boolean;                   // Issues有効フラグ
  hasProjects: boolean;                 // Projects有効フラグ
  hasWiki: boolean;                     // Wiki有効フラグ
  createdAt: string;                    // 作成日時
  updatedAt: string;                    // 更新日時
  size: number;                         // リポジトリサイズ
  topics: string[];                     // トピック一覧
}

/**
 * GitHubタスク実行オプションの型
 */
export interface GitHubTaskOptions {
  createPullRequest?: boolean;          // PRを作成するかどうか
  baseBranch?: string;                  // ベースブランチ名
  skipTests?: boolean;                  // テストをスキップするかどうか
}

/**
 * プロジェクトタスクの型
 */
export interface ProjectTask {
  id: string;                            // タスクID
  userId?: string;                       // 依頼ユーザーID
  guildId?: string;                      // サーバーID
  channelId?: string;                    // チャンネルID
  specification?: string;                // 要求仕様
  status: ProjectStatus;                 // 現在の状態
  type: 'project' | 'github';            // タスクの種類
  plan?: DevelopmentPlan;                // 開発計画
  errors?: ErrorInfo[];                  // 発生したエラー
  startTime?: number;                    // 開始時刻
  endTime?: number;                      // 終了時刻
  projectPath?: string;                  // プロジェクトパス
  lastProgressUpdate?: number;           // 最終進捗更新時刻
  currentAction?: string;                // 現在の処理内容
  feedbackQueue?: FeedbackQueue;         // フィードバックキュー
  hasCriticalFeedback?: boolean;         // 緊急フィードバックの有無
  additionalInstructions?: string;       // 追加指示（LLMプロンプトに使用）
  requiresRecoding?: boolean;            // 再コーディングが必要
  currentContextualFeedback?: string[];  // 現在のコンテキストに関するフィードバック
  createdAt: Date;                       // 作成日時
  updatedAt: Date;                       // 更新日時
  completedAt?: Date;                    // 完了日時
  cancelledAt?: Date;                    // キャンセル日時
  progress: TaskProgress;                // 進捗状況
  resultUrl?: string;                    // 結果URL（ZIPファイルなど）
  errorMessage?: string;                 // エラーメッセージ
  feedback?: UserFeedback[];             // フィードバック一覧

  // GitHub関連情報
  repoUrl?: string;                      // GitHubリポジトリURL
  repoOwner?: string;                    // GitHubリポジトリオーナー
  repoName?: string;                     // GitHubリポジトリ名
  repoBranch?: string;                   // GitHubリポジトリブランチ
  repoTask?: string;                     // GitHubタスク内容
  pullRequestUrl?: string;               // 作成したプルリクエストのURL
}

/**
 * 外部に公開されるプロジェクト情報の型
 */
export interface ProjectInfo {
  id: string;                            // タスクID
  status: ProjectStatus;                 // 現在の状態
  type: 'project' | 'github';            // タスクの種類
  specification?: string;                // 要求仕様
  createdAt: Date;                       // 作成日時
  updatedAt: Date;                       // 更新日時
  completedAt?: Date;                    // 完了日時
  cancelledAt?: Date;                    // キャンセル日時
  progress: TaskProgress;                // 進捗状況
  resultUrl?: string;                    // 結果URL（ZIPファイルなど）
  errorMessage?: string;                 // エラーメッセージ
  pullRequestUrl?: string;               // 作成したプルリクエストのURL（GitHub連携の場合）
}

/**
 * 進捗イベントリスナー関数の型
 */
export type ProgressListener = (task: ProjectTask, message: string, isPartial?: boolean) => Promise<void>;

/**
 * プロンプト種別に応じたテンプレート変数
 */
export interface PromptVariables {
  // 全テンプレート共通の変数
  projectName?: string;          // プロジェクト名
  projectDescription?: string;   // プロジェクトの説明
  currentTime?: string;         // 現在時刻
  
  // 計画立案用変数
  specification?: string;        // 要求仕様
  contextFiles?: string;         // コンテキストとして提供する既存ファイル
  
  // コード生成用変数
  filePath?: string;             // 生成するファイルパス
  fileDescription?: string;      // ファイルの説明
  relatedCode?: string;          // 関連コード
  codingStandards?: string;      // コーディング規約
  
  // デバッグ用変数
  errorMessage?: string;         // エラーメッセージ
  errorCode?: string;            // エラー発生コード
  stackTrace?: string;           // スタックトレース
  testCode?: string;             // テストコード
  attemptCount?: number;         // 修正試行回数
}

/**
 * プランナーモジュールのインターフェース
 */
export interface Planner {
  /**
   * 要求仕様から開発計画を生成
   * @param task プロジェクトタスク
   */
  createPlan(task: ProjectTask): Promise<DevelopmentPlan>;
  
  /**
   * フィードバックに基づいて計画を調整
   * @param task プロジェクトタスク
   * @param feedback フィードバック
   */
  adjustPlan(task: ProjectTask, feedback: string): Promise<DevelopmentPlan>;
  
  /**
   * フィードバックに基づいて計画を再構築
   * @param task プロジェクトタスク
   * @param processingPrompt 処理用プロンプト
   */
  refactorPlan(task: ProjectTask, processingPrompt: string): Promise<DevelopmentPlan>;
}

/**
 * コーダーモジュールのインターフェース
 */
export interface Coder {
  /**
   * ファイルを生成
   * @param task プロジェクトタスク
   * @param fileInfo 生成するファイル情報
   */
  generateFile(task: ProjectTask, fileInfo: FileInfo): Promise<string>;
  
  /**
   * 依存関係をインストール
   * @param task プロジェクトタスク
   */
  installDependencies(task: ProjectTask): Promise<boolean>;
  
  /**
   * フィードバックに基づいてファイルを再生成
   * @param task プロジェクトタスク
   * @param fileInfo 再生成するファイル情報
   * @param existingContent 既存の内容
   */
  regenerateFile(task: ProjectTask, fileInfo: FileInfo, existingContent: string): Promise<string>;
  
  /**
   * フィードバックに基づいてファイルを調整
   * @param task プロジェクトタスク
   * @param feedback フィードバック
   */
  adjustFileWithFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean>;
  
  /**
   * フィードバックに基づいて機能を追加
   * @param task プロジェクトタスク
   * @param feedback フィードバック
   */
  addFeatureFromFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean>;
}

/**
 * テスターモジュールのインターフェース
 */
export interface Tester {
  /**
   * テストを実行
   * @param task プロジェクトタスク
   */
  runTests(task: ProjectTask): Promise<TestResult>;
}

/**
 * デバッガーモジュールのインターフェース
 */
export interface Debugger {
  /**
   * エラーを分析し、修正案を適用
   * @param task プロジェクトタスク
   * @param errorInfo エラー情報
   */
  fixError(task: ProjectTask, errorInfo: ErrorInfo): Promise<boolean>;
}

// コアタイプをエクスポート
export { TaskStatus, FeedbackOptions } from './core/types';
