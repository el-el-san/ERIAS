/**
 * LLM統合モジュール
 * Gemini APIを活用したコード生成、分析機能を提供
 */

import { logger } from '../../tools/logger';
import { config } from '../../config/config';
import { RepoAnalysisResult } from './repositoryAnalyzer';

// Gemini APIクライアントのimport
// 既存のGeminiクライアントを再利用
import { GeminiClient } from '../../llm/geminiClient';
import { ConversationManager } from '../../llm/conversationManager';

export class LLMIntegration {
  private geminiClient: GeminiClient;
  private conversationManager: ConversationManager;

  constructor() {
    this.geminiClient = new GeminiClient(config.GOOGLE_API_KEY, config.DEFAULT_MODEL);
    this.conversationManager = new ConversationManager();
  }

  /**
   * タスク記述からファイル構造を分析する
   */
  public async analyzeTaskForFileStructure(
    taskDescription: string,
    repoAnalysis: RepoAnalysisResult
  ): Promise<Array<{
    path: string;
    type: string;
    language: string;
    description: string;
  }>> {
    try {
      logger.info(`タスク分析を開始: ${taskDescription}`);

      // 会話コンテキストを設定
      const conversationId = `task_analysis_${Date.now()}`;
      this.conversationManager.createConversation(conversationId);

      // プロンプトを構築
      const prompt = this.buildTaskAnalysisPrompt(taskDescription, repoAnalysis);
      
      // Gemini APIに送信
      const response = await this.geminiClient.generateContent(prompt);
      
      // 会話に追加
      this.conversationManager.addMessage(conversationId, 'user', prompt);
      this.conversationManager.addMessage(conversationId, 'assistant', response);
      
      // レスポンスをJSONとして解析
      try {
        // JSON部分を抽出
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
          throw new Error('JSON形式の応答が見つかりません');
        }
        
        const jsonStr = jsonMatch[1];
        const parsedFiles = JSON.parse(jsonStr);
        
        // 応答を検証
        if (!Array.isArray(parsedFiles)) {
          throw new Error('応答が配列ではありません');
        }
        
        return parsedFiles.map(file => ({
          path: file.path || '',
          type: file.type || 'unknown',
          language: file.language || 'unknown',
          description: file.description || taskDescription
        }));
      } catch (parseError: unknown) {
        if (typeof parseError === 'object' && parseError !== null && 'message' in parseError) {
          logger.error(`応答の解析に失敗: ${(parseError as { message?: string }).message}`);
          throw new Error(`応答の解析に失敗: ${(parseError as { message?: string }).message}`);
        } else {
          logger.error('応答の解析に失敗: 不明なエラー');
          throw new Error('応答の解析に失敗: 不明なエラー');
        }
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`タスク分析中にエラーが発生: ${(error as { message?: string }).message}`);
      } else {
        logger.error('タスク分析中にエラーが発生: 不明なエラー');
      }
      throw error;
    }
  }

  /**
   * コードを生成する
   */
  public async generateCode(
    description: string,
    language: string,
    repoAnalysis: RepoAnalysisResult
  ): Promise<string> {
    try {
      logger.info(`コード生成を開始: ${description} (${language})`);

      // 会話コンテキストを設定
      const conversationId = `code_generation_${Date.now()}`;
      this.conversationManager.createConversation(conversationId);

      // プロンプトを構築
      const prompt = this.buildCodeGenerationPrompt(description, language, repoAnalysis);
      
      // Gemini APIに送信
      const response = await this.geminiClient.generateContent(prompt);
      
      // 会話に追加
      this.conversationManager.addMessage(conversationId, 'user', prompt);
      this.conversationManager.addMessage(conversationId, 'assistant', response);
      
      // コードブロックを抽出
      const codeBlockRegex = new RegExp('```(?:' + language + ')?\\n([\\s\\S]*?)\\n```');
      const codeMatch = response.match(codeBlockRegex);
      
      if (codeMatch && codeMatch[1]) {
        return codeMatch[1];
      }
      
      // コードブロックが見つからない場合は全体を返す（必要に応じて別途処理）
      return response.replace(/^.*?生成されたコード:\n/s, '');
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`コード生成中にエラーが発生: ${(error as { message?: string }).message}`);
      } else {
        logger.error('コード生成中にエラーが発生: 不明なエラー');
      }
      throw error;
    }
  }

  /**
   * コード生成後のレコメンデーションを生成
   */
  public async generateRecommendations(
    taskDescription: string,
    generatedFiles: Array<{ path: string; content: string }>,
    repoAnalysis: RepoAnalysisResult
  ): Promise<string[]> {
    try {
      logger.info(`レコメンデーション生成を開始: ${taskDescription}`);

      // 会話コンテキストを設定
      const conversationId = `recommendations_${Date.now()}`;
      this.conversationManager.createConversation(conversationId);

      // プロンプトを構築（ファイル数が多い場合は概要のみにする）
      const prompt = this.buildRecommendationsPrompt(
        taskDescription,
        generatedFiles,
        repoAnalysis
      );
      
      // Gemini APIに送信
      const response = await this.geminiClient.generateContent(prompt);
      
      // 会話に追加
      this.conversationManager.addMessage(conversationId, 'user', prompt);
      this.conversationManager.addMessage(conversationId, 'assistant', response);
      
      // 箇条書きを解析
      const recommendationsMatch = response.match(/(?:- (.+)$)+/gm);
      if (recommendationsMatch) {
        return recommendationsMatch.map((item: string) => item.replace(/^- /, ''));
      }
      
      // 箇条書きが見つからない場合は手動で分割
      return response
        .replace(/^.*?推奨事項:\n/s, '')
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => line.replace(/^\d+\.\s*/, ''));
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`レコメンデーション生成中にエラーが発生: ${(error as { message?: string }).message}`);
      } else {
        logger.error('レコメンデーション生成中にエラーが発生: 不明なエラー');
      }
      throw error;
    }
  }

  /**
   * タスク分析プロンプトを構築
   */
  private buildTaskAnalysisPrompt(taskDescription: string, repoAnalysis: RepoAnalysisResult): string {
    return `あなたはGitHubリポジトリに必要なファイルを分析するAIアシスタントです。
以下のタスク説明とリポジトリ分析結果に基づいて、実装に必要なファイル構造を決定してください。

## タスク説明
${taskDescription}

## リポジトリ分析結果
- リポジトリ名: ${repoAnalysis.repoName}
- 主要言語: ${repoAnalysis.primaryLanguage}
- 使用フレームワーク: ${repoAnalysis.detectedFrameworks.join(', ')}
- プロジェクトタイプ: ${repoAnalysis.projectType}
- テスト有無: ${repoAnalysis.hasTests ? 'あり' : 'なし'}

## 依存関係
\`\`\`json
${JSON.stringify(repoAnalysis.dependencyGraph, null, 2)}
\`\`\`

## 要求
タスクを実装するために必要なファイルの一覧を以下の形式のJSONで出力してください。
- path: ファイルパス（src/からの相対パス）
- type: ファイルタイプ（class, interface, types, util, test, react, function, flask, djangoなど）
- language: プログラミング言語（typescript, javascript, pythonなど）
- description: ファイルの説明

レスポンスはJSON形式のみとし、余計な説明は省略してください。

\`\`\`json
[
  {
    "path": "src/example/path.ts",
    "type": "class",
    "language": "typescript",
    "description": "説明"
  }
]
\`\`\`

レスポンスはmax 10ファイルに留めてください。`;
  }

  /**
   * コード生成プロンプトを構築
   */
  private buildCodeGenerationPrompt(
    description: string,
    language: string,
    repoAnalysis: RepoAnalysisResult
  ): string {
    return `あなたはコード生成を行うAIアシスタントです。
以下の説明とリポジトリ情報に基づいて、高品質な${language}コードを生成してください。

## 要件
${description}

## リポジトリ情報
- リポジトリ名: ${repoAnalysis.repoName}
- 主要言語: ${repoAnalysis.primaryLanguage}
- 使用フレームワーク: ${repoAnalysis.detectedFrameworks.join(', ')}
- プロジェクトタイプ: ${repoAnalysis.projectType}

## コード生成の指示
- 言語: ${language}
- コーディング規約: 一般的なベストプラクティスに従ってください
- コメント: 適切なドキュメンテーションコメントを含めてください
- エラーハンドリング: 基本的なエラーハンドリングを含めてください

## 出力形式
コードのみを出力してください。マークダウンのコードブロック形式で出力してください。説明は不要です。

\`\`\`${language}
// ここにコードを記述
\`\`\``;
  }

  /**
   * レコメンデーション生成プロンプトを構築
   */
  private buildRecommendationsPrompt(
    taskDescription: string,
    generatedFiles: Array<{ path: string; content: string }>,
    repoAnalysis: RepoAnalysisResult
  ): string {
    // ファイル情報を要約（コンテンツは量が多いため概要のみ）
    const filesInfo = generatedFiles.map(file => {
      return `- ${file.path}: ${this.summarizeFile(file.content)}`;
    }).join('\n');

    return `あなたは開発レコメンデーションを提供するAIアシスタントです。
以下のタスク説明、リポジトリ情報、生成されたファイルに基づいて、実装に関するレコメンデーションを提供してください。

## タスク説明
${taskDescription}

## リポジトリ情報
- リポジトリ名: ${repoAnalysis.repoName}
- 主要言語: ${repoAnalysis.primaryLanguage}
- 使用フレームワーク: ${repoAnalysis.detectedFrameworks.join(', ')}
- プロジェクトタイプ: ${repoAnalysis.projectType}

## 生成されたファイル
${filesInfo}

## 要求
このタスクの実装を完了するための推奨事項を5〜7個、箇条書きで提供してください。以下を含めてください：

1. 主要な実装ポイント
2. 潜在的な課題と対策
3. テスト方法の提案
4. パフォーマンス／セキュリティ考慮事項
5. ドキュメンテーション推奨事項

レスポンスは以下の形式でお願いします：

推奨事項:
- 推奨事項1
- 推奨事項2
...`;
  }

  /**
   * PR生成プロンプトを構築
   */
  public async generatePRDescription(
    taskDescription: string,
    changedFiles: Array<{ path: string; changes: string }>,
    repoAnalysis: RepoAnalysisResult
  ): Promise<string> {
    try {
      logger.info(`PR説明生成を開始: ${taskDescription}`);

      // 会話コンテキストを設定
      const conversationId = `pr_description_${Date.now()}`;
      this.conversationManager.createConversation(conversationId);

      // ファイル変更情報を要約
      const changesInfo = changedFiles.map(file => {
        return `- ${file.path}: ${this.summarizeChanges(file.changes)}`;
      }).join('\n');

      // プロンプト構築
      const prompt = `あなたはGitHubプルリクエスト（PR）の説明を生成するAIアシスタントです。
以下のタスク説明、リポジトリ情報、変更ファイルに基づいて、PRの説明文を生成してください。

## タスク説明
${taskDescription}

## リポジトリ情報
- リポジトリ名: ${repoAnalysis.repoName}
- 主要言語: ${repoAnalysis.primaryLanguage}
- 使用フレームワーク: ${repoAnalysis.detectedFrameworks.join(', ')}
- プロジェクトタイプ: ${repoAnalysis.projectType}

## 変更ファイル
${changesInfo}

## 要求
以下の内容を含むPR説明文を生成してください：

1. タイトル
2. 変更の概要（3-5行）
3. 実装詳細（箇条書き）
4. テスト方法（該当する場合）
5. 関連するIssue／タスク（該当する場合は「関連: #<issue番号>」の形式）

レスポンスは以下の形式でお願いします：

# タイトル

## 概要
...

## 実装詳細
- ...
- ...

## テスト方法
...

## 関連
...`;

      // Gemini APIに送信
      const response = await this.geminiClient.generateContent(prompt);
      
      // 会話に追加
      this.conversationManager.addMessage(conversationId, 'user', prompt);
      this.conversationManager.addMessage(conversationId, 'assistant', response);
      
      return response;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`PR説明生成中にエラーが発生: ${(error as { message?: string }).message}`);
      } else {
        logger.error('PR説明生成中にエラーが発生: 不明なエラー');
      }
      
      // エラー時のフォールバック
      return `# ${taskDescription}

## 概要
実装機能の概要

## 実装詳細
- 機能詳細
- 変更内容

## テスト方法
実装機能のテスト方法を記述

## 関連
なし`;
    }
  }

  /**
   * PRレビューコメントを生成
   */
  public async generatePRReviewComments(
    taskDescription: string,
    changedFiles: Array<{ path: string; content: string }>,
    repoAnalysis: RepoAnalysisResult
  ): Promise<Array<{ filePath: string; line: number; comment: string }>> {
    try {
      logger.info(`PRレビューコメント生成を開始: ${taskDescription}`);

      // 会話コンテキストを設定
      const conversationId = `pr_review_${Date.now()}`;
      this.conversationManager.createConversation(conversationId);

      // ファイル数が多い場合は制限
      const maxFiles = 3;
      const filesForReview = changedFiles.slice(0, maxFiles);
      
      // 各ファイルごとにレビューコメントを生成
      const reviewComments: Array<{ filePath: string; line: number; comment: string }> = [];
      
      for (const file of filesForReview) {
        // ファイル内容が大きすぎる場合は一部のみにする
        const contentToReview = file.content.length > 5000 
          ? file.content.substring(0, 5000) + "\n... (以下省略) ..."
          : file.content;
        
        // プロンプト構築
        const prompt = `あなたはコードレビューを行うAIアシスタントです。
以下のコードファイルをレビューし、改善点や問題点を具体的な行番号とともに指摘してください。

## タスク説明
${taskDescription}

## ファイル情報
- パス: ${file.path}
- 言語: ${this.detectLanguageFromPath(file.path)}

## コード内容
\`\`\`
${contentToReview}
\`\`\`

## 要求
以下の観点からコードレビューを行い、最大5つのコメントを生成してください：

1. コード品質（可読性、保守性）
2. パフォーマンス
3. セキュリティ
4. エラーハンドリング
5. ベストプラクティス

レスポンスは以下の形式のJSONで出力してください：

\`\`\`json
[
  {
    "line": 行番号,
    "comment": "コメント内容"
  }
]
\`\`\``;

        // Gemini APIに送信
        const response = await this.geminiClient.generateContent(prompt);
        
        // 会話に追加
        this.conversationManager.addMessage(conversationId, 'user', prompt);
        this.conversationManager.addMessage(conversationId, 'assistant', response);
        
        // JSON部分を抽出
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          try {
            const comments = JSON.parse(jsonMatch[1]);
            
            if (Array.isArray(comments)) {
              comments.forEach(comment => {
                if (comment.line && comment.comment) {
                  reviewComments.push({
                    filePath: file.path,
                    line: comment.line,
                    comment: comment.comment
                  });
                }
              });
            }
          } catch (error) {
            if (typeof error === 'object' && error !== null && 'message' in error) {
              logger.error(`レビューコメントのJSON解析に失敗: ${(error as { message?: string }).message}`);
            } else {
              logger.error('レビューコメントのJSON解析に失敗: 不明なエラー');
            }
          }
        }
      }
      
      return reviewComments;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        logger.error(`PRレビューコメント生成中にエラーが発生: ${(error as { message?: string }).message}`);
      } else {
        logger.error('PRレビューコメント生成中にエラーが発生: 不明なエラー');
      }
      return [];
    }
  }

  /**
   * ファイルパスから言語を検出
   */
  private detectLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'ts':
        return 'TypeScript';
      case 'tsx':
        return 'TypeScript (React)';
      case 'js':
        return 'JavaScript';
      case 'jsx':
        return 'JavaScript (React)';
      case 'py':
        return 'Python';
      case 'html':
        return 'HTML';
      case 'css':
        return 'CSS';
      case 'json':
        return 'JSON';
      case 'md':
        return 'Markdown';
      default:
        return 'Unknown';
    }
  }

  /**
   * ファイル内容を要約
   */
  private summarizeFile(content: string): string {
    // ファイルサイズを計算
    const sizeKB = (content.length / 1024).toFixed(1);
    
    // 先頭の50文字を取得
    const firstLine = content.split('\n')[0].trim().substring(0, 50);
    
    // コメントや関数定義を抽出（簡易的な実装）
    const imports = (content.match(/import .*/g) || []).length;
    const functions = (content.match(/(?:function|def) \w+/g) || []).length;
    const classes = (content.match(/class \w+/g) || []).length;
    
    return `${sizeKB}KB, ${imports}インポート, ${functions}関数, ${classes}クラス`;
  }

  /**
   * 変更内容を要約
   */
  private summarizeChanges(changes: string): string {
    // 変更内容を行数で集計
    const lines = changes.split('\n');
    let additions = 0;
    let deletions = 0;
    
    lines.forEach(line => {
      if (line.startsWith('+')) additions++;
      if (line.startsWith('-')) deletions++;
    });
    
    return `${additions}行追加, ${deletions}行削除`;
  }
}