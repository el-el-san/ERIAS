# Discord連携 自律型AI開発エージェント

Discord上の指示に基づき、ローカルPC環境でWebアプリケーション等のプロジェクト生成（計画、コーディング、テスト、デバッグ）を自律的に行うAIエージェントです。

## 主な機能

- Discordコマンドによるタスク受付
- LLM (Gemini中心) によるタスク分解・計画立案
- コード自動生成 (ファイル単位、機能単位)
- 依存関係の自動インストール (npm install等)
- 自動テスト実行 (Jest, Mocha等)
- エラー検出時の自動デバッグ・コード修正
- 成果物の報告 (Discordメッセージ、ファイル添付)

## 必要条件

- Node.js 18.x以上
- Discord Bot Token
- Google Gemini API Key

## インストール

```bash
# リポジトリをクローン
git clone [リポジトリURL] d-ai-agent
cd d-ai-agent

# 依存関係をインストール
npm install

# 環境変数ファイルを設定
cp .env.example .env
# .envファイルを編集して必要なAPI keyを設定

# TypeScriptをコンパイル
npm run build
```

## 使い方

1. `.env`ファイルに必要なトークンとAPI Keyを設定します
2. Botを起動します: `npm start`
3. Discord上で以下のようなコマンドを使用します:

```
/newproject 簡単なReactのTODOアプリを作成してください。LocalStorageを使ってデータを保存し、タスクの追加、編集、削除、完了のマークができるようにしてください。
```

## 設定

`.env`ファイルで以下の設定が可能です:

- `DISCORD_TOKEN`: Discord Bot Token
- `GOOGLE_API_KEY`: Google Gemini API Key
- `DEFAULT_MODEL`: 使用するGeminiモデル (デフォルト: gemini-1.5-pro-latest)
- `MAX_EXECUTION_TIME`: 最大実行時間（ミリ秒）
- その他詳細設定については`.env.example`を参照

## セキュリティ上の注意

このエージェントはシステムコマンドを実行する能力を持つため、以下の点に注意してください:

- 信頼できるDiscordサーバーでのみ使用する
- 必要に応じてユーザー権限を制限する
- コード生成とコマンド実行を行うディレクトリを適切に隔離する
- 可能であればDockerコンテナ内で実行する

## ライセンス

MIT
