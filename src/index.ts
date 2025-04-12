import path from 'path';
import fs from 'fs';
import { DiscordBot } from './bot/discordBot';
import { CommandHandler } from './bot/commandHandler';
import { AgentCore } from './agent/agentCore';
import { Planner } from './agent/planner';
import { Coder } from './agent/coder';
import { Tester } from './agent/tester';
import { Debugger } from './agent/debugger';
import { GeminiClient } from './llm/geminiClient';
import { PromptBuilder } from './llm/promptBuilder';
import config from './config/config';
import logger from './utils/logger';
import toolRegistry from './llm/toolRegistry';
import fileSystemTools from './tools/fileSystem';
import commandTools from './tools/commandExecutor';

// 環境変数の確認
function checkRequiredEnvVars(): boolean {
  const requiredVars = ['DISCORD_TOKEN', 'GOOGLE_API_KEY'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    logger.error(`以下の必須環境変数が設定されていません: ${missing.join(', ')}`);
    logger.error('環境変数を.envファイルに設定するか、環境変数として直接設定してください。');
    return false;
  }
  return true;
}

// プロンプトディレクトリとテンプレートファイルの準備
function preparePromptTemplates() {
  const promptsDir = path.resolve(process.cwd(), 'prompts');
  
  // プロンプトディレクトリがなければ作成
  if (!fs.existsSync(promptsDir)) {
    fs.mkdirSync(promptsDir, { recursive: true });
    logger.info(`プロンプトディレクトリを作成しました: ${promptsDir}`);
  }
  
  // デフォルトのプロンプトテンプレートファイルが存在するか確認し、なければ作成
  const defaultTemplates = {
    'system_prompt.md': `あなたはソフトウェア開発エージェントです。与えられた仕様に基づいてWebアプリケーションなどを設計・実装する能力があります。
コードを生成する際は、最新のベストプラクティスに従い、安全で保守性の高いコードを書いてください。
必要に応じて適切なファイル操作や外部コマンドを実行するためのFunction Callingを使用できます。

重要な注意点:
- 実装するコードは実際に動作するものにしてください。仮想的なAPIや存在しないモジュールを使わないでください。
- コードは完全に実装してください。「...」や「ここに実装を追加」などのプレースホルダーは使わないでください。
- 依存関係（npmパッケージなど）が必要な場合は明示的に指定してください。
- セキュリティを考慮した実装をしてください（入力検証、XSS対策、SQLインジェクション対策など）。
- 可能な限りTypeScriptの型を活用してください。
`,
    
    'plan_prompt.md': `以下の仕様に基づいて、開発計画を立案してください。

## 仕様
{{spec}}

## 指示
1. まず、プロジェクトの概要と技術スタックを決定してください。
2. 必要なnpmパッケージ（開発用と本番用）をリストアップしてください。
3. 作成すべきファイルのリストを作成し、各ファイルの役割と内容を説明してください。
4. 実装ステップを順序立てて説明してください。

以下のJSON形式で回答してください:

\`\`\`json
{
  "projectDescription": "プロジェクトの説明",
  "technicalStack": {
    "frontend": ["フロントエンド技術"],
    "backend": ["バックエンド技術"],
    "database": ["データベース技術"],
    "testing": ["テスト技術"],
    "other": ["その他技術"]
  },
  "dependencies": {
    "production": ["本番用パッケージ"],
    "development": ["開発用パッケージ"]
  },
  "files": [
    {
      "path": "ファイルパス",
      "description": "ファイルの説明",
      "dependencies": ["依存するファイルのパス"]
    }
  ],
  "steps": [
    {
      "description": "実装ステップの説明",
      "status": "pending"
    }
  ]
}
\`\`\`
`,
    
    'code_prompt.md': `以下のファイルを実装してください。

## ファイル情報
ファイルパス: {{filePath}}
説明: {{fileDescription}}

## 関連コード
{{relatedCode}}

## コーディング規約
{{codingStandards}}

完全なコードを提供してください。コード内にプレースホルダー（「...」や「TODO」など）を含めないでください。
依存関係（import文など）はすべて明示的に記述してください。
可能な限りTypeScriptの型を活用してください。
`,
    
    'debug_prompt.md': `以下のエラーを修正してください。

## エラー情報
エラーメッセージ: {{errorMessage}}

## エラーが発生したコード
\`\`\`
{{errorCode}}
\`\`\`

## スタックトレース
\`\`\`
{{stackTrace}}
\`\`\`

## テストコード (存在する場合)
\`\`\`
{{testCode}}
\`\`\`

## 修正試行回数
{{attemptCount}}

エラーの原因を分析し、修正したコード全体を提供してください。
修正前後の違いを明確に説明し、なぜその修正が問題を解決するのかを説明してください。
`
  };
  
  for (const [filename, content] of Object.entries(defaultTemplates)) {
    const filePath = path.join(promptsDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      logger.info(`デフォルトのプロンプトテンプレートファイルを作成しました: ${filePath}`);
    }
  }
}

// プロジェクトディレクトリの準備
function prepareProjectsDirectory() {
  const projectsDir = path.resolve(process.cwd(), 'projects');
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
    logger.info(`プロジェクトディレクトリを作成しました: ${projectsDir}`);
  }
}

// アプリケーションを起動
async function startApplication() {
  try {
    logger.info('Discord AI エージェントを起動しています...');
    
    // ツールレジストリを初期化
    toolRegistry.registerTools([...fileSystemTools, ...commandTools]);
    
    // 各モジュールを初期化
    const geminiClient = new GeminiClient();
    geminiClient.setTools(toolRegistry.getAllTools()); // ツールを設定
    const promptBuilder = new PromptBuilder();
    
    const planner = new Planner(geminiClient, promptBuilder);
    const coder = new Coder(geminiClient, promptBuilder);
    const tester = new Tester();
    const debugger_ = new Debugger(geminiClient, promptBuilder);
    
    const agentCore = new AgentCore(planner, coder, tester, debugger_);
    const discordBot = new DiscordBot(agentCore);
    
    // シャットダウンハンドラを登録
    process.on('SIGINT', async () => {
      logger.info('SIGINT受信: アプリケーションを終了します...');
      await discordBot.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM受信: アプリケーションを終了します...');
      await discordBot.stop();
      process.exit(0);
    });
    
    // Discordボットを起動
    await discordBot.start();
    
    logger.info('Discord AI エージェントが起動しました。');
  } catch (error) {
    logger.error(`アプリケーションの起動に失敗しました: ${(error as Error).message}`);
    process.exit(1);
  }
}

// メイン処理
(async () => {
  // 必要なディレクトリとファイルを準備
  preparePromptTemplates();
  prepareProjectsDirectory();
  
  // 環境変数をチェック
  if (!checkRequiredEnvVars()) {
    process.exit(1);
  }
  
  // アプリケーションを起動
  await startApplication();
})();