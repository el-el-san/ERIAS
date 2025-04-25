# ERIAS

ERIASは、Discord AIエージェントとして機能するプロジェクトです。

## GitHub連携機能の修正

GitHubリポジトリへの変更のプッシュとプルリクエストの作成機能において、プルリクエスト作成時に「No commits between...」エラーが発生する問題を修正しました。

この修正により、新しいフィーチャーブランチを作成する前に、ローカルリポジトリのデフォルトブランチ（例: `main`）をリモートリポジトリの最新の状態に同期する処理が追加されました。これにより、プルリクエスト作成時にベースブランチとの間に適切な差分が認識されるようになります。

### 修正内容

- `src/services/githubService.ts`: ローカルブランチをリモートと同期する `syncBranch` メソッドを追加しました。
- `src/agent/githubTaskExecutor.ts`: 新しいブランチを作成する前に、`githubService.syncBranch` を呼び出す処理を追加しました。
