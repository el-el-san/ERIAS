import { ProjectTask, DevelopmentPlan, Planner } from '../agent/types.js';
import { adjustPlan, refactorPlan } from './adjustPlanStub.js';

/**
 * プランナークラス
 * AIを使用して開発計画を作成・更新する
 */
export class PlannerImpl implements Planner {
  /**
   * 要求仕様から開発計画を作成
   * @param task プロジェクトタスク
   */
  public async createPlan(task: ProjectTask): Promise<DevelopmentPlan> {
    // サンプルの開発計画を返す（実際の実装ではLLMを使用）
    return {
      projectDescription: 'サンプルプロジェクト: ' + (task.specification?.substring(0, 50) ?? '') + '...',
      technicalStack: {
        frontend: ['React', 'TypeScript'],
        backend: ['Node.js', 'Express'],
        database: ['MongoDB'],
        testing: ['Jest']
      },
      dependencies: {
        production: ['react', 'react-dom', 'express', 'mongoose'],
        development: ['typescript', 'jest', '@types/react']
      },
      files: [
        {
          path: 'package.json',
          description: 'パッケージ設定ファイル',
          status: 'pending'
        },
        {
          path: 'tsconfig.json',
          description: 'TypeScript設定ファイル',
          status: 'pending'
        },
        {
          path: 'src/index.tsx',
          description: 'アプリケーションのエントリーポイント',
          status: 'pending'
        },
        {
          path: 'src/App.tsx',
          description: 'メインアプリケーションコンポーネント',
          status: 'pending'
        },
        {
          path: 'src/components/Header.tsx',
          description: 'ヘッダーコンポーネント',
          status: 'pending'
        }
      ],
      steps: [
        {
          description: 'プロジェクト初期化',
          status: 'pending'
        },
        {
          description: 'コンポーネント作成',
          status: 'pending'
        },
        {
          description: 'APIエンドポイント実装',
          status: 'pending'
        }
      ]
    };
  }

  /**
   * フィードバックに基づいて計画を調整
   * @param task プロジェクトタスク
   * @param feedback フィードバック
   */
  public async adjustPlan(task: ProjectTask, feedback: string): Promise<DevelopmentPlan> {
    return await adjustPlan(task, feedback);
  }

  /**
   * フィードバックに基づいて計画を再構築
   * @param task プロジェクトタスク
   * @param processingPrompt 処理用プロンプト
   */
  public async refactorPlan(task: ProjectTask, processingPrompt: string): Promise<DevelopmentPlan> {
    return await refactorPlan(task, processingPrompt);
  }
}
