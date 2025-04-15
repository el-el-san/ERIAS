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
- **リアルタイムフィードバック** - 生成プロセス中の追加指示・修正指示に対応

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

## コマンド一覧

Discordボットで使用できるコマンドの一覧です：

- `/new [仕様]` - 新しいプロジェクトを生成します
- `/status [タスクID]` - プロジェクト生成の状態を確認します
- `/cancel [タスクID]` - 実行中のプロジェクト生成をキャンセルします
- `/help` - ヘルプメッセージを表示します

また、スラッシュから始まらないメッセージを送信すると、AIがチャット形式で応答します。質問やコードの相談などにご利用ください。

> 注：当初の`/newproject`コマンドも後方互換性のため使用可能ですが、今後は`/new`の使用を推奨します。

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
- その他詳細設定については`.env.example`を参照

## 開発者向け情報

### 最近の修正点 (2025-04-15)

TypeScriptビルドエラーを修正しました:
- fileSystem.tsの関数にオーバーロードを追加し、型安全性を向上
- 各モジュールの型エラーとインポートエラーを解決
- パラメータ型の互換性問題を解決するため、型変換と引数チェックを実装
- any型キャストを削除し、型安全な実装に修正
- 具体的な修正内容:
  - src/tools/fileSystem.ts:
    - writeProjectFile、readProjectFile、listDirectory、exists関数をオーバーロード対応に変更
  - src/agent/coder.ts, src/agent/debugger.ts, src/agent/planner.ts:
    - ツール関数呼び出しの型安全性を向上
  - src/agent/tester.ts: 
    - executeNpmScriptとexecuteCommand関数の呼び出しを型安全に修正

以前の修正:
- 不要だった`src/tools/githubClient.ts`ファイルを削除
- `commandExecutor.ts`にて`CommandResult`型を定義しエクスポート
- `ExecOptions` インターフェースのエクスポート追加
- `executeNpmInstall`関数の引数型を修正し、string型と配列型の両方に対応

これらの修正により、`npm run build`コマンドが正常に実行できるようになりました。

## セキュリティ上の注意

このエージェントはシステムコマンドを実行する能力を持つため、以下の点に注意してください:

- 信頼できるDiscordサーバーでのみ使用する
- 必要に応じてユーザー権限を制限する
- コード生成とコマンド実行を行うディレクトリを適切に隔離する
- 可能であればDockerコンテナ内で実行する

## ライセンス

MIT
