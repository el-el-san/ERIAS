# Agent Core モジュール

AgentCoreリファクタリング後のコアモジュールについての説明です。

## モジュール構成

AgentCoreは以下のモジュールに分割されています：

### 1. AgentCore.ts

メインのオーケストレーターであり、他のモジュールを統合します。外部からは`agentCore.ts`のファサードを通じてアクセスします。

主な責務：
- 他のコアモジュールの初期化と統合
- 各種サービスの提供（応答生成、タスク管理、GitHub連携など）

### 2. TaskManager.ts

タスクの状態管理と操作を提供します。

主な責務：
- タスク状態の作成、取得、更新
- タスクの進捗管理
- フィードバック処理

### 3. ResponseGenerator.ts

LLMを使用した応答生成を担当します。

主な責務：
- ユーザーメッセージに対する応答生成
- 会話履歴の管理
- エラーハンドリングとフォールバック応答

### 4. ProjectExecutor.ts

プロジェクト生成タスクの実行を担当します。

主な責務：
- プロジェクト生成フローの実行
- 進捗通知の管理
- エラーハンドリング

### 5. GitHubExecutor.ts

GitHub連携タスクの実行を担当します。

主な責務：
- GitHub関連タスクの実行
- 進捗状態の更新
- エラーハンドリング

### 6. types.ts

コアモジュール固有の型定義を提供します。

主な型：
- TaskStatus: タスクの状態を表す型
- FeedbackOptions: フィードバック処理オプションを表す型
- ProgressNotifier: 進捗通知関数の型

## 使用方法

### AgentCoreの取得

AgentCoreはシングルトンパターンを採用しているため、以下のように取得します：

```typescript
import { AgentCore } from './agent/agentCore';

const agentCore = AgentCore.getInstance();
```

### メソッド呼び出し例

```typescript
// 応答生成
const response = await agentCore.generateResponse(message, target);

// プロジェクト開始
const taskId = await agentCore.startNewProject(spec, target);

// タスク状態取得
const status = agentCore.getTaskStatus(taskId);

// フィードバック処理
await agentCore.processFeedback(taskId, feedback, options);
```

## 拡張方法

新しい機能を追加する場合は、以下の手順に従ってください：

1. 機能に応じた新しいモジュールを作成（`core/`ディレクトリ内）
2. 適切なインターフェースを定義（`types.ts`に追加）
3. `AgentCore.ts`に新しいモジュールの初期化と利用を追加
4. `agentCore.ts`ファサードに新しい機能のメソッドを追加

## テスト

各モジュールは単一責任の原則に従って設計されているため、個別にテストできます。モックを使用して依存関係を分離することで、ユニットテストが容易になります。

## 今後の改善案

1. 依存性注入パターンをさらに活用
2. ユニットテストの追加
3. より堅牢なエラーハンドリング
4. 状態管理の最適化
