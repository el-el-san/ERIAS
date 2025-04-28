// 通知ペイロードの型定義

export interface NotificationFile {
  /** ファイルの絶対または相対パス */
  path: string;
  /** ファイル名（拡張子含む） */
  name: string;
  /** MIMEタイプ（例: "image/png", "application/pdf" など） */
  mimeType: string;
  /** ファイルサイズ（バイト単位、任意） */
  size?: number;
  /** その他のメタデータ（任意） */
  [key: string]: any;
}

/**
 * 通知の内容を表すペイロード
 * - テキストのみ
 * - ファイルのみ
 * - テキスト＋ファイル
 * のいずれにも対応
 */
export interface NotificationPayload {
  /** 通知テキスト（任意） */
  text?: string;
  /** 添付ファイル（任意、複数可） */
  files?: NotificationFile[];
}