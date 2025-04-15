// regenerateFileStub.ts - Coderのモック実装（テスト用）
import { ProjectTask, FileInfo, UserFeedback } from '../agent/types';

/**
 * フィードバックに基づいてファイルを再生成するモック関数
 * @param task プロジェクトタスク
 * @param fileInfo 再生成するファイル情報
 * @param existingContent 既存の内容
 */
export async function regenerateFile(
  task: ProjectTask,
  fileInfo: FileInfo,
  existingContent: string
): Promise<string> {
  console.log(`[MOCK] Regenerating file ${fileInfo.path} based on feedback`);
  
  // 既存のコンテンツに追加コメントを付与
  if (existingContent) {
    // ファイルタイプに基づいてコメント形式を選択
    let commentPrefix = '// ';
    if (fileInfo.path.endsWith('.html')) {
      commentPrefix = '<!-- ';
    } else if (fileInfo.path.endsWith('.css')) {
      commentPrefix = '/* ';
    } else if (fileInfo.path.endsWith('.py')) {
      commentPrefix = '# ';
    }
    
    // 既存コンテンツの先頭にフィードバックコメントを追加
    return `${commentPrefix}UPDATED BASED ON FEEDBACK: ${new Date().toISOString()}\n${existingContent}`;
  }
  
  // 既存コンテンツがない場合は新しいコンテンツを生成
  return `// Generated file: ${fileInfo.path}\n// Description: ${fileInfo.description}\n// Created based on feedback at ${new Date().toISOString()}\n\nconsole.log('This is a regenerated file based on user feedback');`;
}

/**
 * ファイルをフィードバックで調整するモック関数
 * @param task プロジェクトタスク
 * @param feedback フィードバック
 */
export async function adjustFileWithFeedback(
  task: ProjectTask,
  feedback: UserFeedback
): Promise<boolean> {
  console.log(`[MOCK] Adjusting file ${feedback.targetFile} with feedback: ${feedback.content}`);
  
  // 実際の処理は特に行わず成功を返す
  return true;
}

/**
 * フィードバックに基づいて機能を追加するモック関数
 * @param task プロジェクトタスク
 * @param feedback フィードバック
 */
export async function addFeatureFromFeedback(
  task: ProjectTask,
  feedback: UserFeedback
): Promise<boolean> {
  console.log(`[MOCK] Adding feature based on feedback: ${feedback.content}`);
  
  // 実際の処理は特に行わず成功を返す
  return true;
}
