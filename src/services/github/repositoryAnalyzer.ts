/**
 * GitHub リポジトリ分析器
 * リポジトリの構造、依存関係、コードパターンを分析するためのモジュール
 */

import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { logger } from '../../tools/logger';
import { detectLanguage, detectFramework, getFileType } from './languageDetection';
import { analyzeCodeDependencies } from './codeAnalyzer';
import { config } from '../../config/config';

export interface RepoAnalysisResult {
  repoName: string;
  primaryLanguage: string;
  detectedFrameworks: string[];
  fileStructure: FileNode[];
  dependencyGraph: DependencyInfo;
  projectType: ProjectType;
  hasTests: boolean;
}

export interface FileNode {
  path: string;
  type: 'file' | 'directory';
  language?: string;
  children?: FileNode[];
  size?: number;
  complexity?: number;
  imports?: string[];
  exports?: string[];
}

export interface DependencyInfo {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  moduleDependencies: Record<string, string[]>;
}

export enum ProjectType {
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  FULLSTACK = 'fullstack',
  LIBRARY = 'library',
  CLI = 'cli',
  OTHER = 'other'
}

export class RepositoryAnalyzer {
  private git: SimpleGit;
  private octokit: Octokit;
  private repoPath: string;
  private owner: string;
  private repo: string;

  constructor(repoPath: string, owner: string, repo: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
    this.octokit = new Octokit({ auth: config.GITHUB_TOKEN });
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * リポジトリの全体分析を実行する
   */
  public async analyzeRepository(): Promise<RepoAnalysisResult> {
    try {
      logger.info(`リポジトリ分析を開始: ${this.owner}/${this.repo}`);
      
      // リポジトリ言語統計を取得
      const languageStats = await this.getRepositoryLanguages();
      const primaryLanguage = this.getPrimaryLanguage(languageStats);
      
      // ファイル構造を取得
      const fileStructure = await this.getFileStructure();
      
      // 依存関係を分析
      const dependencyGraph = await this.analyzeDependencies();
      
      // フレームワーク検出
      const detectedFrameworks = await this.detectFrameworks(fileStructure, dependencyGraph);
      
      // プロジェクトタイプを決定
      const projectType = this.determineProjectType(fileStructure, dependencyGraph, detectedFrameworks);
      
      // テストの有無を確認
      const hasTests = this.checkForTests(fileStructure);
      
      const result: RepoAnalysisResult = {
        repoName: this.repo,
        primaryLanguage,
        detectedFrameworks,
        fileStructure,
        dependencyGraph,
        projectType,
        hasTests
      };
      
      logger.info(`リポジトリ分析完了: ${this.owner}/${this.repo}`);
      return result;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`リポジトリ分析中にエラーが発生: ${(error as { message?: string }).message}`);
        throw new Error(`リポジトリ分析に失敗しました: ${(error as { message?: string }).message}`);
      } else {
        logger.error('リポジトリ分析中にエラーが発生: 不明なエラー');
        throw new Error('リポジトリ分析に失敗しました: 不明なエラー');
      }
    }
  }

  /**
   * リポジトリの言語統計を取得
   */
  private async getRepositoryLanguages(): Promise<Record<string, number>> {
    try {
      const response = await this.octokit.repos.listLanguages({
        owner: this.owner,
        repo: this.repo
      });
      return response.data;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`言語統計の取得に失敗: ${(error as { message?: string }).message}`);
      } else {
        logger.error('言語統計の取得に失敗: 不明なエラー');
      }
      return {};
    }
  }
  
  /**
   * 言語統計から主要言語を決定
   */
  private getPrimaryLanguage(languageStats: Record<string, number>): string {
    if (Object.keys(languageStats).length === 0) {
      return 'Unknown';
    }
    
    // 最もバイト数の多い言語を取得
    const primaryLanguage = Object.entries(languageStats)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return primaryLanguage;
  }
  
  /**
   * リポジトリのファイル構造を再帰的に取得
   */
  private async getFileStructure(dirPath: string = ''): Promise<FileNode[]> {
    const fullPath = path.join(this.repoPath, dirPath);
    const result: FileNode[] = [];
    
    try {
      const items = fs.readdirSync(fullPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const fullItemPath = path.join(fullPath, item);
        
        // .git ディレクトリはスキップ
        if (item === '.git') continue;
        
        const stats = fs.statSync(fullItemPath);
        
        if (stats.isDirectory()) {
          const children = await this.getFileStructure(itemPath);
          result.push({
            path: itemPath,
            type: 'directory',
            children
          });
        } else {
          const language = getFileType(itemPath);
          const fileNode: FileNode = {
            path: itemPath,
            type: 'file',
            language,
            size: stats.size
          };
          
          // コードファイルの場合、さらに分析
          if (['javascript', 'typescript', 'python'].includes(language)) {
            try {
              const content = fs.readFileSync(fullItemPath, 'utf-8');
              const analysis = await analyzeCodeDependencies(content, language);
              fileNode.imports = analysis.imports;
              fileNode.exports = analysis.exports;
              fileNode.complexity = analysis.complexity;
            } catch (error: unknown) {
              if (typeof error === 'object' && error !== null && 'message' in error) {
                logger.warn(`ファイル分析エラー (${itemPath}): ${(error as { message?: string }).message}`);
              } else {
                logger.warn(`ファイル分析エラー (${itemPath}): 不明なエラー`);
              }
            }
          }
          
          result.push(fileNode);
        }
      }
      
      return result;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`ファイル構造の取得に失敗 (${dirPath}): ${(error as { message?: string }).message}`);
      } else {
        logger.error(`ファイル構造の取得に失敗 (${dirPath}): 不明なエラー`);
      }
      return [];
    }
  }
  
  /**
   * 依存関係の分析
   */
  private async analyzeDependencies(): Promise<DependencyInfo> {
    const result: DependencyInfo = {
      dependencies: {},
      devDependencies: {},
      moduleDependencies: {}
    };
    
    try {
      // package.json の分析
      const packageJsonPath = path.join(this.repoPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        
        if (packageJson.dependencies) {
          result.dependencies = packageJson.dependencies;
        }
        
        if (packageJson.devDependencies) {
          result.devDependencies = packageJson.devDependencies;
        }
      }
      
      // Python の requirements.txt 分析
      const requirementsPath = path.join(this.repoPath, 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        const requirements = fs.readFileSync(requirementsPath, 'utf-8');
        const lines = requirements.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const parts = trimmed.split('==');
            const name = parts[0].trim();
            const version = parts.length > 1 ? parts[1].trim() : 'latest';
            result.dependencies[name] = version;
          }
        }
      }
      
      // モジュール間の依存関係分析
      // 実装省略（コードベース全体を分析する複雑な処理）
      
      return result;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`依存関係の分析に失敗: ${(error as { message?: string }).message}`);
      } else {
        logger.error('依存関係の分析に失敗: 不明なエラー');
      }
      return result;
    }
  }
  
  /**
   * フレームワークの検出
   */
  private async detectFrameworks(
    fileStructure: FileNode[],
    dependencies: DependencyInfo
  ): Promise<string[]> {
    const frameworks: Set<string> = new Set();
    
    // 依存関係からフレームワークを検出
    const allDeps = {
      ...dependencies.dependencies,
      ...dependencies.devDependencies
    };
    
    // React検出
    if ('react' in allDeps && 'react-dom' in allDeps) {
      frameworks.add('React');
      
      // Next.js検出
      if ('next' in allDeps) {
        frameworks.add('Next.js');
      }
    }
    
    // Vue検出
    if ('vue' in allDeps) {
      frameworks.add('Vue.js');
      
      // Nuxt.js検出
      if ('nuxt' in allDeps) {
        frameworks.add('Nuxt.js');
      }
    }
    
    // Express検出
    if ('express' in allDeps) {
      frameworks.add('Express');
    }
    
    // Nest.js検出
    if ('@nestjs/core' in allDeps) {
      frameworks.add('Nest.js');
    }
    
    // Flask/Django検出 (Python)
    if ('flask' in allDeps) {
      frameworks.add('Flask');
    }
    if ('django' in allDeps) {
      frameworks.add('Django');
    }
    
    // ファイル構造からさらに検出
    // 設定ファイルなどの特徴的なパターンを検索
    const flattenedFiles = this.flattenFileStructure(fileStructure);
    
    // Angular検出
    if (flattenedFiles.some(f => f.path.includes('angular.json'))) {
      frameworks.add('Angular');
    }
    
    return [...frameworks];
  }
  
  /**
   * ファイル構造を平坦化
   */
  private flattenFileStructure(nodes: FileNode[]): FileNode[] {
    const result: FileNode[] = [];
    
    const traverse = (node: FileNode) => {
      result.push(node);
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    
    nodes.forEach(traverse);
    return result;
  }
  
  /**
   * プロジェクトタイプの決定
   */
  private determineProjectType(
    fileStructure: FileNode[],
    dependencies: DependencyInfo,
    frameworks: string[]
  ): ProjectType {
    const flatFiles = this.flattenFileStructure(fileStructure);
    const fileNames = flatFiles.map(f => f.path.toLowerCase());
    
    // フロントエンド判定
    const isFrontend = 
      frameworks.some(f => ['React', 'Vue.js', 'Angular'].includes(f)) ||
      'react' in dependencies.dependencies ||
      'vue' in dependencies.dependencies;
    
    // バックエンド判定
    const isBackend =
      frameworks.some(f => ['Express', 'Nest.js', 'Flask', 'Django'].includes(f)) ||
      'express' in dependencies.dependencies ||
      'fastify' in dependencies.dependencies ||
      fileNames.some(f => f.includes('server.js') || f.includes('app.py'));
    
    // CLI判定
    const isCli = 
      'commander' in dependencies.dependencies ||
      'yargs' in dependencies.dependencies ||
      fileNames.some(f => f.includes('cli.js') || f.includes('bin/'));
    
    // ライブラリ判定
    const isLibrary = 
      fileNames.includes('package.json') &&
      !fileNames.some(f => f.includes('public/') || f.includes('src/index.html'));
    
    if (isFrontend && isBackend) {
      return ProjectType.FULLSTACK;
    } else if (isFrontend) {
      return ProjectType.FRONTEND;
    } else if (isBackend) {
      return ProjectType.BACKEND;
    } else if (isCli) {
      return ProjectType.CLI;
    } else if (isLibrary) {
      return ProjectType.LIBRARY;
    }
    
    return ProjectType.OTHER;
  }
  
  /**
   * テストの有無を確認
   */
  private checkForTests(fileStructure: FileNode[]): boolean {
    const flatFiles = this.flattenFileStructure(fileStructure);
    
    return flatFiles.some(file => 
      file.type === 'file' && (
        file.path.includes('test/') ||
        file.path.includes('__tests__/') ||
        file.path.includes('spec/') ||
        file.path.endsWith('.test.js') ||
        file.path.endsWith('.test.ts') ||
        file.path.endsWith('.spec.js') ||
        file.path.endsWith('.spec.ts') ||
        file.path.endsWith('_test.py') ||
        file.path.endsWith('test_*.py')
      )
    );
  }
}
