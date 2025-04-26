# ERIAS GitHub連携機能の仕様変更

## 概要
ERIASのGitHub連携機能で、修正後のpushやプルリクエスト(PR)の送信先を「ERIASリポジトリ固定」から「任意のGitHubリポジトリ指定」に変更しました。

## 主な変更点

- Discordボットの `!newproject` コマンドで、プロジェクト仕様と一緒にGitHubリポジトリURLを必須で指定するようになりました。
- コマンド例  
  ```
  !newproject Reactを使ったTODOアプリ https://github.com/yourname/yourrepo
  ```
  - 最後の引数がGitHubリポジトリURLとして認識されます
  - push/PRはこのリポジトリに対して行われます

- コマンド入力例やエラーメッセージもリポジトリURL必須で案内されます

## 技術的なポイント

- `src/bot/discordBot.ts` の `handleNewProjectCommand` でrepoUrlを必須引数化
- `src/bot/discord/handlers.ts` でコマンド引数から仕様とrepoUrlを分離して渡すロジックを追加
- agentCoreのタスク生成もrepoUrlを受け取る設計に今後統一予定

## 今後の注意

- 既存の他UI/APIや他botコマンドも同様の設計に統一する必要があります
- コマンドヘルプやドキュメントも随時更新してください
