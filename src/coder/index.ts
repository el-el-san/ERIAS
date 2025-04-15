import { ProjectTask, FileInfo, Coder, UserFeedback } from '../agent/types';
import { regenerateFile, adjustFileWithFeedback, addFeatureFromFeedback } from './regenerateFileStub';

/**
 * コーダークラス
 * AIを使用してコードを生成する
 */
export class CoderImpl implements Coder {
  /**
   * ファイルを生成
   * @param task プロジェクトタスク
   * @param fileInfo 生成するファイル情報
   */
  public async generateFile(task: ProjectTask, fileInfo: FileInfo): Promise<string> {
    // サンプルのファイル内容を返す（実際の実装ではLLMを使用）
    const fileContent = this.getDefaultContent(fileInfo.path);
    
    // 遅延をシミュレート
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return fileContent;
  }

  /**
   * 依存関係をインストール
   * @param task プロジェクトタスク
   */
  public async installDependencies(task: ProjectTask): Promise<boolean> {
    // 依存関係インストールの成功を返す（実際の実装ではnpm/yarnコマンドを実行）
    console.log(`[MOCK] Installing dependencies for project ${task.id}`);
    
    // 遅延をシミュレート
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return true;
  }

  /**
   * フィードバックに基づいてファイルを再生成
   * @param task プロジェクトタスク
   * @param fileInfo 再生成するファイル情報
   * @param existingContent 既存の内容
   */
  public async regenerateFile(task: ProjectTask, fileInfo: FileInfo, existingContent: string): Promise<string> {
    return await regenerateFile(task, fileInfo, existingContent);
  }

  /**
   * フィードバックに基づいてファイルを調整
   * @param task プロジェクトタスク
   * @param feedback フィードバック
   */
  public async adjustFileWithFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean> {
    return await adjustFileWithFeedback(task, feedback);
  }

  /**
   * フィードバックに基づいて機能を追加
   * @param task プロジェクトタスク
   * @param feedback フィードバック
   */
  public async addFeatureFromFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean> {
    return await addFeatureFromFeedback(task, feedback);
  }

  /**
   * ファイルパスに基づいたデフォルトのコンテンツを生成
   * @param filePath ファイルパス
   */
  private getDefaultContent(filePath: string): string {
    if (filePath.endsWith('.json')) {
      return `{\n  "name": "sample-project",\n  "version": "1.0.0"\n}`;
    } else if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
      return `// ${filePath}\n\n/**\n * サンプル機能\n */\nfunction sample() {\n  console.log("Hello, World!");\n}\n\nexport default sample;`;
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      return `// ${filePath}\nimport React from 'react';\n\n/**\n * サンプルコンポーネント\n */\nconst Component = () => {\n  return <div>Hello, World!</div>;\n};\n\nexport default Component;`;
    } else if (filePath.endsWith('.html')) {
      return `<!DOCTYPE html>\n<html>\n<head>\n  <title>Sample Page</title>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n</body>\n</html>`;
    } else if (filePath.endsWith('.css')) {
      return `/* ${filePath} */\n\nbody {\n  font-family: sans-serif;\n  margin: 0;\n  padding: 0;\n}`;
    } else {
      return `# ${filePath}\n\nThis is a sample file content for ${filePath}`;
    }
  }
}
