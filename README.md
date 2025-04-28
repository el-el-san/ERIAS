# ERIAS - Discord+Slack連携 自律型AI開発エージェント

ERIASは、複数のメッセージングプラットフォーム（Discord、Slack）を通じて動作する自律型AI開発エージェントです。ユーザーの指示に基づいて、プロジェクトの計画、コード生成、テスト、デバッグを自動で実行します。

## 特徴

- 🤖 **AIによる自律的な開発**: Google Gemini APIを活用し、プロジェクト開発を自動化
- 💬 **マルチプラットフォーム対応**: Discord、Slackなど複数のメッセージングプラットフォームをサポート
- 🔄 **リアルタイムフィードバック**: 開発中に追加の指示やフィードバックを提供可能
- 📊 **進捗モニタリング**: プロジェクトの進捗状況をリアルタイムで確認
- 🛠️ **GitHub連携**: リポジトリのクローン、ブランチ作成、プルリクエスト作成を自動化
- 🎨 **画像生成機能**: 通常の会話で画像生成リクエストを受け付け、Gemini 2.0 Flashを使用して高品質な画像を生成

## システムアーキテクチャ

### コアコンポーネント

- **AgentCore**: 開発プロセス全体のオーケストレーション
- **Planner**: プロジェクト計画の立案
- **Coder**: コード生成
- **Tester**: テストの実行
- **Debugger**: エラーの検出と修正
- **FeedbackHandler**: ユーザーフィードバックの処理
- **GitHubTaskExecutor**: GitHub関連タスクの実行
- **ImageGenerator**: Gemini 2.0 Flashによる画像生成機能
- **PlatformManager**: 複数プラットフォームの管理
- **PlatformAdapter**: プラットフォーム固有の実装を抽象化

### 主要機能

1. **プロジェクト生成**
   - 要件定義から完成までの全工程を自動化
   - 技術スタックの選定、ファイル構造の設計
   - コード生成、依存関係のインストール
   - テスト実行とデバッグ

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
├── platforms/           # プラットフォーム抽象化レイヤー
│   ├── types.ts        # 共通インターフェース
│   ├── platformManager.ts # プラットフォーム管理
│   ├── discord/        # Discord実装
│   │   └── discordAdapter.ts
│   └── slack/          # Slack実装
│       └── slackAdapter.ts
├── agent/              # AIエージェントのコア機能
│   ├── agentCore.ts    # オーケストレーション
│   ├── planner.ts      # 計画立案
│   ├── coder.ts        # コード生成
│   ├── tester.ts       # テスト実行
│   ├── debugger.ts     # デバッグ
│   ├── services/       # 各種サービス
│   │   └── notificationService.ts
│   └── githubTaskExecutor.ts  # GitHub連携
├── generators/         # 生成機能
│   ├── imageGenerator.ts # 画像生成
│   ├── imageRequestDetector.ts # 画像リクエスト検出
│   └── types.ts        # 型定義
├── bot/                # ボット関連
│   ├── commandHandler.ts # コマンド処理
│   └── feedbackMessageHandler.ts # フィードバック処理
├── llm/                # LLM（大規模言語モデル）関連
│   ├── geminiClient.ts # Gemini API連携
│   ├── conversationManager.ts # 会話履歴管理
│   └── promptBuilder.ts # プロンプト生成
├── services/           # 外部サービス連携
│   └── githubService.ts # GitHub API操作
├── tools/              # ユーティリティツール
│   ├── commandExecutor.ts # コマンド実行
│   ├── fileSystem.ts   # ファイル操作
│   └── logger.ts       # ログ出力
├── config/             # 設定関連
│   └── config.ts       # 環境設定
└── index.ts            # エントリーポイント
```

## 開発フロー

1. **計画立案フェーズ**
   - 要件分析と技術スタック選定
   - プロジェクト構造の設計
   - 必要なファイルの特定

2. **コーディングフェーズ**
   - ファイルごとにコード生成
   - 依存関係の解決
   - README.mdの自動生成

3. **テストフェーズ**
   - テストコードの実行
   - 結果の検証

4. **デバッグフェーズ**
   - エラーの特定と修正
   - 再テストの実行

5. **完了フェーズ**
   - プロジェクトのアーカイブ
   - Discord/Slack経由での配信

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
- **将来拡張予定**:
  - Microsoft Teams
  - LINE
  - Webインターフェース

## ライセンス

MIT License
