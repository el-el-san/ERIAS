/**
 * GitHub連携強化機能 - インデックス
 * すべてのGitHub連携強化モジュールをエクスポート
 */

export * from './enhancedGithubService';
export * from './repositoryAnalyzer';
export * from './codeGenerator';
export * from './codeAnalyzer';
export * from './languageDetection';
export * from './llmIntegration';
export * from './templates/typescriptTemplates';
export * from './templates/pythonTemplates';

// 型定義のエクスポート
export interface GitHubFeatureResult {
  files: string[];
  message: string;
}

export interface PRResult {
  url: string;
  number: number;
}

// 追加設定のエクスポート
export const defaultBranchName = 'main';
export const defaultCommitMessage = 'feat: 機能を追加';
