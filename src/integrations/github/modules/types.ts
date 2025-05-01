/**
 * GitHub連携機能の共通型定義
 */

import { RepoAnalysisResult } from '../repositoryAnalyzer';

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
  analysisResult?: RepoAnalysisResult;
}

export interface ReviewComment {
  filePath: string;
  line: number;
  comment: string;
}
