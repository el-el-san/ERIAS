# ERIAS - Discord+Slack連携 自律型AI開発エージェント

ERIASは、複数のメッセージングプラットフォーム（Discord、Slack）を通じて動作する自律型AI開発エージェントです。ユーザーの指示に基づいて、プロジェクトの計画、コード生成、テスト、デバッグを自動で実行します。

## 特徴

- 🤖 **AIによる自律的な開発**: Google Gemini APIを活用し、プロジェクト開発を自動化
- 💬 **マルチプラットフォーム対応**: Discord、Slackなど複数のメッセージングプラットフォームをサポート
- 🔄 **リアルタイムフィードバック**: 開発中に追加の指示やフィードバックを提供可能
- 📊 **進捗モニタリング**: プロジェクトの進捗状況をリアルタイムで確認
- 🛠️ **GitHub連携**: リポジトリのクローン、ブランチ作成、プルリクエスト作成を自動化
- 🎨 **画像生成機能**: 通常の会話で画像生成リクエストを受け付け、Gemini 2.0 Flashを使用して高品質な画像を生成

## 現状の実装

現在のERIASは以下の実装状況です：

- **マルチプラットフォーム対応基盤**: PlatformManager、各プラットフォームアダプター（Discord、Slack）の基本実装完了
- **基本的なコマンドシステム**: プロジェクト作成、ステータス確認、キャンセル、ヘルプ、GitHub連携の各コマンド定義と登録の仕組みを実装
- **タスク管理システム**: タスクのライフサイクル管理、進捗追跡、通知機能の基本フレームワーク構築済み
- **画像生成機能**: Gemini 2.0 Flash APIを使用した基本的な画像生成とプロンプト最適化の仕組みを実装
- **LLM連携**: Gemini APIとの連携、会話履歴管理、基本的なプロンプト生成の仕組みを実装
- **プロジェクト生成機能**: 計画立案、コード生成、テスト、デバッグ、ユーザーフィードバック処理の一連のプロセスを自動化

### 開発途上の機能

- **GitHub連携**: 基本的な枠組みは整備されているが、詳細実装は発展途上
- **フィードバックによる機能追加**: 基本フレームワークは実装済みだが具体的な解析・適用部分は発展途上

## システムアーキテクチャ

### コアコンポーネント

- **AgentCore**: 開発プロセス全体のオーケストレーション、タスク管理
- **PlatformManager**: 各メッセージングプラットフォームのアダプター管理
- **ProjectGenerator**: プロジェクト生成の全体プロセスを管理
- **Planner**: プロジェクト計画の立案
- **Coder**: コード生成、依存関係管理、README生成
- **Tester**: テストの実行
- **Debugger**: エラーの検出と修正
- **FeedbackHandler**: ユーザーフィードバックの処理
- **GitHubTaskExecutor**: GitHub関連タスクの実行
- **ImageGenerator**: Gemini 2.0 Flashによる画像生成機能
- **PlatformAdapter**: プラットフォーム固有の実装を抽象化

### 主要機能

1. **プロジェクト生成**
   - 要件定義から完成までの全工程を自動化
   - 技術スタックの選定、ファイル構造の設計
   - コード生成、依存関係のインストール
   - テスト実行とデバッグ
   - README.mdの自動生成
   - 完成プロジェクトのZIPアーカイブ化

2. **GitHub連携**
   - リポジトリのクローン
   - 機能実装とコミット
   - プルリクエストの自動作成

3. **リアルタイムフィードバック**
   - 開発中の任意のタイミングでフィードバック提供
   - 緊急指示や機能追加のリクエストに対応

4. **画像生成**
   - 通常の会話で「〜の画像を生成して」と入力するだけで画像生成
   - Gemini 2.0 Flash APIを使用した高品質な画像生成
   - 生成された画像はDiscordやSlackに直接送信

5. **マルチプラットフォーム対応**
   - Discord、Slackなど複数のプラットフォームをサポート
   - 抽象化レイヤーによる拡張性の高い設計
   - 将来的に新しいプラットフォームを追加可能

## 使用方法

### インストール

```bash
# リポジトリのクローン
git clone https://github.com/el-el-san/ERIAS.git
cd ERIAS

# 依存関係のインストール
npm install

# ビルド
npm run build
```

### 設定

1. `.env.example`を`.env`にコピー
2. 以下の環境変数を設定：

```env
# 一般設定
NODE_ENV=development
LOG_LEVEL=info
LOG_FILE=./logs/erias.log

# Discord設定
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
ALLOWED_GUILD_IDS=guild_id1,guild_id2
ALLOWED_USER_IDS=user_id1,user_id2
ENABLE_DISCORD=true

# Slack設定
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_SIGNING_SECRET=your-slack-signing-secret
SLACK_APP_TOKEN=xapp-your-slack-app-token
SLACK_PORT=3000
SLACK_ALLOWED_CHANNEL_IDS=channel_id1,channel_id2
ENABLE_SLACK=false

# GitHub設定（オプション）
GITHUB_TOKEN=your_github_token

# Google Gemini API設定
GOOGLE_API_KEY=your_google_api_key
DEFAULT_MODEL=gemini-2.5-flash-preview-04-17

# タスク実行設定
MAX_EXECUTION_TIME=3600000
MAX_DEBUG_RETRIES=5
PROJECTS_DIR=./projects
```

### 起動

```bash
npm start
```

## コマンド

### 基本コマンド (Discord, Slack共通)

- `/newproject [仕様]` - 新しいプロジェクトを生成
- `/status [タスクID]` - プロジェクトの進捗状況を確認
- `/cancel [タスクID]` - 実行中のプロジェクトをキャンセル
- `/help` - ヘルプを表示

### GitHub連携コマンド

- `/githubrepo [リポジトリURL] [タスク]` - 既存リポジトリに機能を追加

### フィードバック機能

実行中のプロジェクトに対して追加の指示を提供できます：

```
task:タスクID [指示内容]
```

特殊タグ：
- `#urgent` または `#緊急` - 緊急の指示として処理
- `#feature` または `#機能` - 新機能の追加
- `#fix` または `#修正` - バグ修正
- `#code` または `#コード` - コード修正
- `file:パス` - 特定ファイルへの指示

### 画像生成機能

通常の会話で画像生成をリクエストできます：

```
「○○の画像を生成して」
「○○のイメージを作って」
"generate image of ..."
"create an image of ..."
```

ERIASが自動的に生成リクエストを検出し、適切なプロンプトを最適化してGemini 2.0 Flashを使用して画像を出力します。

## プロジェクト構造

```
src/
├── platforms/                # プラットフォーム抽象化レイヤー
│   ├── types.ts             # 共通インターフェース
│   ├── platformManager.ts   # プラットフォーム管理
│   ├── discord/             # Discord実装
│   │   └── discordAdapter.ts
│   └── slack/               # Slack実装
│       └── slackAdapter.ts
├── agent/                   # AIエージェントのコア機能
│   ├── agentCore.ts         # ファサードパターンによる外部API
│   ├── core/                # コアモジュール
│   │   ├── AgentCore.ts     # メインコアクラス
│   │   ├── GitHubExecutor.ts # GitHub連携実行
│   │   ├── ProjectExecutor.ts # プロジェクト実行
│   │   ├── ResponseGenerator.ts # LLM応答生成
│   │   ├── TaskManager.ts   # タスク管理
│   │   ├── types.ts         # コア固有の型定義
│   │   └── index.ts         # エクスポート
│   ├── utils/               # ユーティリティ
│   │   ├── progressUtils.ts # 進捗関連ユーティリティ
│   │   └── index.ts         # エクスポート
│   ├── services/            # 各種サービス
│   │   └── notificationService.ts
│   ├── planner.ts           # 計画立案
│   ├── coder.ts             # コード生成
│   ├── tester.ts            # テスト実行
│   ├── debugger.ts          # デバッグ
│   ├── feedbackHandler.ts   # フィードバック処理
│   ├── githubTaskExecutor.ts # GitHub連携
│   ├── projectGenerator.ts  # プロジェクト生成
│   └── types.ts             # 共通型定義
├── generators/              # 生成機能
│   ├── imageGenerator.ts    # 画像生成
│   ├── imageRequestDetector.ts # 画像リクエスト検出
│   └── types.ts             # 型定義
├── bot/                     # ボット関連
│   ├── discord/             # Discord固有の実装
│   │   ├── events.ts        # Discordイベント
│   │   └── handlers.ts      # Discordハンドラー
│   ├── commandHandler.ts    # コマンド処理
│   ├── discordBot.ts        # Discordボット
│   └── feedbackMessageHandler.ts # フィードバック処理
├── llm/                     # LLM（大規模言語モデル）関連
│   ├── geminiClient.ts      # Gemini API連携
│   ├── conversationManager.ts # 会話履歴管理
│   ├── promptBuilder.ts     # プロンプト生成
│   └── toolRegistry.ts      # ツール登録
├── coder/                   # コード生成関連
│   ├── dependency.ts        # 依存関係管理
│   ├── generation.ts        # コード生成
│   ├── index.ts             # エクスポート
│   ├── regenerateFileStub.ts # ファイル再生成
│   └── utils.ts             # ユーティリティ
├── planner/                 # 計画立案関連
│   ├── adjustPlanStub.ts    # 計画調整
│   └── index.ts             # エクスポート
├── services/                # 外部サービス連携
│   └── githubService.ts     # GitHub API操作
├── tools/                   # ユーティリティツール
│   ├── commandExecutor.ts   # コマンド実行
│   ├── fileSystem.ts        # ファイル操作
│   └── logger.ts            # ログ出力
├── config/                  # 設定関連
│   └── config.ts            # 環境設定
└── index.ts                 # エントリーポイント
```

## プロジェクト生成フロー

1. **計画立案フェーズ**
   - 要件分析と技術スタック選定
   - プロジェクト構造の設計
   - 必要なファイルの特定と計画作成

2. **フィードバック処理**
   - ユーザーに計画を提示し、フィードバックを受付
   - フィードバックを処理して計画を調整

3. **コーディングフェーズ**
   - 依存関係に基づいたファイル生成順序の決定
   - 各ファイルのコード生成
   - 依存関係のインストール
   - README.mdの自動生成

4. **テストフェーズ**
   - テスト実行と結果検証
   - テスト失敗時はデバッグフェーズへ

5. **デバッグフェーズ**（テスト失敗時）
   - エラーの検出と修正
   - 再テストの実行（最大試行回数あり）

6. **完了フェーズ**
   - 最終テストの実行
   - プロジェクトのZIPアーカイブ化
   - 完了通知

## AgentCoreのモジュール構造

AgentCoreはリファクタリングにより、より保守性の高いモジュール構造に再設計されています：

- **AgentCore (src/agent/agentCore.ts)**: ファサードパターンを用いた外部公開API
- **コアモジュール (src/agent/core/)**: 
  - **AgentCore**: オーケストレーションと統合
  - **TaskManager**: タスク状態の管理
  - **ResponseGenerator**: LLM応答生成
  - **ProjectExecutor**: プロジェクト生成実行
  - **GitHubExecutor**: GitHub関連タスク実行
- **ユーティリティ (src/agent/utils/)**: 
  - **progressUtils**: 進捗表示関連

この構造により、責務の分離が明確になり、テスト容易性や保守性が向上しています。各モジュールは単一責任の原則に従い、特定の機能に集中しています。

## マルチプラットフォーム設計

ERIASは抽象化されたアダプターパターンを採用し、複数のメッセージングプラットフォームに対応できるよう設計されています。

### 主な機能

- **プラットフォーム抽象化**: 共通インターフェースによりプラットフォーム固有のAPIを抽象化
- **適応型通知システム**: 各プラットフォームに最適化されたメッセージング
- **統一コマンド処理**: 全プラットフォームで一貫したコマンド体験を提供
- **拡張性**: 新しいプラットフォームの追加が容易な設計

### サポートプラットフォーム

- **Discord**: Discord.js APIを使用してBotとして実装
- **Slack**: Slack Bolt APIを使用してAppとして実装

## 開発の次のステップ

現状の実装を踏まえ、今後の開発予定は以下の通りです：

1. **GitHub連携の強化**
   - リポジトリ分析の精度向上
   - PRレビュー機能の追加

2. **フィードバックシステムの強化**
   - 機能追加フィードバックの完全実装
   - より詳細なコード解析と適用メカニズムの改善

3. **UI/UXの改善**
   - プラットフォーム固有の機能活用
   - インタラクティブな要素の追加

4. **LLM連携の最適化**
   - プロンプトエンジニアリングの強化
   - より細かなコンテキスト管理

5. **モジュール構造の更なる改善**
   - 依存性注入パターンの活用
   - ユニットテストの追加と拡充

## 依存ライブラリ

- Discord.js v14.14.1
- Slack Bolt API v3.14.0
- Google Genai v0.10.0 / Generative-AI v0.24.0
- Octokit/Rest v21.1.1
- その他ユーティリティライブラリ

## ライセンス

MIT License
