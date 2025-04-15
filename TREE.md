# ディレクトリ構造

```
d-ai-agent/
├── .env                 # 環境変数設定ファイル
├── .env.example         # 環境変数設定例
├── .git/                # Gitリポジトリ情報
├── .gitignore           # Gitの除外設定
├── dist/                # ビルド後のJavaScriptファイル
├── logs/                # ログファイル
│   └── githubClient.ts.deleted # 削除されたGitHubクライアント（バックアップ）
├── node_modules/        # npmパッケージ
├── package.json         # プロジェクト設定・依存関係
├── projects/            # 生成されるプロジェクトの保存先
├── prompts/             # LLMプロンプトテンプレート
│   ├── code_prompt.md   # コード生成用プロンプト
│   ├── debug_prompt.md  # デバッグ用プロンプト
│   ├── plan_prompt.md   # 計画立案用プロンプト
│   └── system_prompt.md # システム設定用プロンプト
├── README.md            # プロジェクト説明
├── src/                 # ソースコード
│   ├── agent/           # エージェント関連のコア機能
│   │   ├── agentCore.ts
│   │   ├── coder.ts
│   │   ├── debugger.ts
│   │   ├── feedbackHandler.ts
│   │   ├── planner.ts
│   │   ├── projectGenerator.ts
│   │   ├── tester.ts
│   │   └── types.ts
│   ├── bot/             # Discord Bot関連
│   │   ├── commandHandler.ts
│   │   ├── discordBot.ts
│   │   └── feedbackMessageHandler.ts
│   ├── coder/           # コード生成機能
│   │   ├── index.ts
│   │   └── regenerateFileStub.ts
│   ├── config/          # 設定関連
│   │   └── config.ts
│   ├── debugger/        # デバッグ機能
│   │   └── index.ts
│   ├── index.ts         # エントリーポイント
│   ├── llm/             # LLM (Large Language Model) インターフェース
│   │   ├── geminiClient.ts
│   │   ├── promptBuilder.ts
│   │   └── toolRegistry.ts
│   ├── planner/         # 計画立案機能
│   │   ├── adjustPlanStub.ts
│   │   └── index.ts
│   ├── tester/          # テスト実行機能
│   │   └── index.ts
│   ├── tools/           # ツール・ユーティリティ
│   │   ├── commandExecutor.ts
│   │   └── fileSystem.ts
│   └── utils/           # ユーティリティ関数
│       ├── asyncUtils.ts
│       └── logger.ts
├── ToDo.md              # 作業タスクリスト
└── tsconfig.json        # TypeScript設定
```