// 差分反映型: README追加タスクのみ対応の最小実装
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectTask, UserFeedback } from '../types.js';

/**
 * フィードバック内容に基づき、既存リポジトリ内容を維持しつつREADME.mdのみ編集・追加
 */
export async function addFeatureFromFeedback(
  task: ProjectTask,
  feedback: UserFeedback
): Promise<boolean> {
  try {
    // タスク内容に「README」や「readme」が含まれていればREADME.mdを編集
    const lower = feedback.content.toLowerCase();
    if (lower.includes('readme')) {
      const readmePath = path.join(task.projectPath, 'README.md');
      let content = '';
      try {
        content = await fs.readFile(readmePath, 'utf-8');
      } catch {
        // ファイルがなければ新規作成
        content = '';
      }
      // 追記内容例（実際はAI生成やプロンプト応答で拡張可）
      const append = '\n\n# ハローワールド\nこのREADMEはAIエージェントによって追加されました。';
      await fs.writeFile(readmePath, content + append, 'utf-8');
      return true;
    }
    // 他のタスク内容は未対応
    return false;
  } catch (e) {
    return false;
  }
}