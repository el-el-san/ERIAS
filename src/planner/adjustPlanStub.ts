// adjustPlanStub.ts - Plannerのモック実装（テスト用）
import { ProjectTask, DevelopmentPlan } from '../agent/types';

/**
 * フィードバックに基づいて計画を調整するモック関数
 * @param task プロジェクトタスク 
 * @param feedback フィードバック
 */
export async function adjustPlan(task: ProjectTask, feedback: string): Promise<DevelopmentPlan> {
  console.log(`[MOCK] Adjusting plan for task ${task.id} based on feedback: ${feedback}`);
  
  // 既存の計画に追加情報を付加して返す
  if (task.plan) {
    return {
      ...task.plan,
      projectDescription: task.plan.projectDescription + `\n(フィードバック反映: ${feedback})`,
      files: [...task.plan.files]
    };
  }
  
  // 計画がない場合はエラー
  throw new Error('No plan exists to adjust');
}

/**
 * テスト結果&フィードバックに基づいて計画を再構築するモック関数
 * @param task プロジェクトタスク
 * @param processingPrompt 処理用プロンプト
 */
export async function refactorPlan(task: ProjectTask, processingPrompt: string): Promise<DevelopmentPlan> {
  console.log(`[MOCK] Refactoring plan for task ${task.id} with prompt length: ${processingPrompt.length}`);
  
  if (!task.plan) {
    throw new Error('No plan exists to refactor');
  }
  
  // 現在の計画のファイルリストからランダムに1つを選んで更新が必要なファイルとしてマーク
  const files = [...task.plan.files];
  if (files.length > 0) {
    const randomIndex = Math.floor(Math.random() * files.length);
    files[randomIndex] = {
      ...files[randomIndex],
      needsUpdate: true,
      description: files[randomIndex].description + ' (フィードバックにより更新)'
    };
  }
  
  // 新しいファイルの追加
  files.push({
    path: 'src/components/FeedbackFeature.js',
    status: 'pending',
    description: 'フィードバックから追加された新機能コンポーネント',
    needsUpdate: false
  });
  
  return {
    ...task.plan,
    projectDescription: task.plan.projectDescription + '\n(緊急フィードバックにより計画変更)',
    files,
    requiresDependencyUpdate: true // 依存関係の更新が必要と設定
  };
}
