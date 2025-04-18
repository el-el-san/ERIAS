# **ERIAS** - Discord連携 自律型AI開発エージェント

Discord上の指示に基づき、ローカルPC環境でWebアプリケーション等のプロジェクト生成（計画、コーディング、テスト、デバッグ）を自律的に行うAIエージェントです。

## 主な機能

- Discordコマンドによるタスク受付
- LLM (Gemini中心) によるタスク分解・計画立案
- コード自動生成 (ファイル単位、機能単位)
- 依存関係の自動インストール (npm install等)
- 自動テスト実行 (Jest, Mocha等)
- エラー検出時の自動デバッグ・コード修正
- 成果物の報告 (Discordメッセージ、ファイル添付、`Plan.md`、`README.md`)
- リアルタイムフィードバック - 生成プロセス中の追加指示・修正指示に対応
- 会話履歴保存 - 通常の会話モードでの会話履歴を保存し、文脈を考慮した応答を提供

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
/new 簡単なReactのTODOアプリを作成してください。LocalStorageを使ってデータを保存し、タスクの追加、編集、削除、完了のマークができるようにしてください。
```

4. 生成プロセス中にフィードバックを提供できます:

```
task:abc123 追加機能として、タスクに優先度を設定できるようにしてください
```

5. 通常の会話モードでAIと対話できます:

```
今日はどうかな？Reactについて教えてください。
```

## コマンド一覧

Discordボットで使用できるコマンドの一覧です：

- `/new [仕様]` - 新しいプロジェクトを生成します
- `/status [タスクID]` - プロジェクト生成の状態を確認します
- `/cancel [タスクID]` - 実行中のプロジェクト生成をキャンセルします
- `/clear` - 現在の会話履歴をクリアします
- `/help` - ヘルプメッセージを表示します

また、スラッシュから始まらないメッセージを送信すると、AIがチャット形式で応答します。質問やコードの相談などにご利用ください。

> 注：当初の`/newproject`コマンドも後方互換性のため使用可能ですが、今後は`/new`の使用を推奨します。

## 会話機能

通常の会話モード（スラッシュコマンドを使用しない場合）では、以下の特徴があります：

- **会話履歴の保存** - ユーザーごと、チャンネルごとに会話の履歴が保存されます
- **文脈を考慮した応答** - AIは過去の会話を参照して応答するため、より自然な対話が可能です
- **会話履歴のクリア** - `/clear`コマンドで現在の会話履歴をクリアして新しい会話を始められます
- **自動期限切れ** - 一定期間（デフォルトで3時間）経過した会話履歴は自動的に削除されます

## フィードバック機能

プロジェクト生成中にリアルタイムで追加指示を提供できます：

```
task:タスクID [フィードバック内容]
```

以下のオプションタグを使用して、フィードバックの性質や重要度を指定できます：

- `#urgent` または `#緊急` - 緊急の指示として優先的に処理
- `#feature` または `#機能` - 新機能追加の指示
- `#fix` または `#修正` - バグ修正指示
- `#code` または `#コード` - コード修正指示
- `file:パス` - 特定ファイルに対する指示（例: `file:src/App.js`）

例：
```
task:abc123 #urgent file:src/components/Header.js ログアウトボタンも追加してください
```

フィードバックは次のタイミングで処理されます：
- 各フェーズ（計画、コーディング、テスト）の完了後
- フェーズ間の短い待機時間中（30秒）
- 緊急フィードバック（`#urgent`）は可能な限り早く処理

## 設定

`.env`ファイルで以下の設定が可能です:

- `DISCORD_TOKEN`: Discord Bot Token
- `GOOGLE_API_KEY`: Google Gemini API Key
- `DEFAULT_MODEL`: 使用するGeminiモデル (デフォルト: gemini-1.5-pro-latest)
- `MAX_EXECUTION_TIME`: 最大実行時間（ミリ秒）
- `MAX_MESSAGES_PER_SESSION`: セッションごとの最大メッセージ数（デフォルト: 10）
- `SESSION_EXPIRY_TIME_MS`: セッション有効期限（ミリ秒、デフォルト: 10800000=3時間）
- `PERSIST_SESSIONS`: セッションを永続化するかどうか（デフォルト: false）
- その他詳細設定については`.env.example`を参照


## セキュリティ上の注意

このエージェントはシステムコマンドを実行する能力を持つため、以下の点に注意してください:

- 信頼できるDiscordサーバーでのみ使用する
- 必要に応じてユーザー権限を制限する
- コード生成とコマンド実行を行うディレクトリを適切に隔離する
- 可能であればDockerコンテナ内で実行する

## ライセンス

MIT
