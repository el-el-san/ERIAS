以下の仕様に基づいて、開発計画を立案してください。

## 仕様
{{spec}}

## 指示
1. まず、プロジェクトの概要と技術スタックを決定してください。
2. 必要なnpmパッケージ（開発用と本番用）をリストアップしてください。
3. 作成すべきファイルのリストを作成し、各ファイルの役割と内容を説明してください。
4. 実装ステップを順序立てて説明してください。

以下のJSON形式で回答してください:

```json
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
```