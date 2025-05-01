import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import { logError } from '../utils/logger';
import { config } from '../config/config';

/**
 * 会話メッセージの型定義
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * 会話セッションの型定義
 */
export interface ConversationSession {
  userId: string;
  channelId: string;
  guildId: string;
  messages: ConversationMessage[];
  lastActivity: number;
}

/**
 * 会話履歴マネージャークラス
 * ユーザーごとの会話履歴を管理
 */
export class ConversationManager {
  // ユーザーID -> チャンネルID -> 会話セッション のマッピング
  private sessions: Map<string, Map<string, ConversationSession>> = new Map();
  
  // 設定値
  private readonly maxMessagesPerSession: number;
  private readonly sessionExpiryTimeMs: number;
  private readonly persistSessions: boolean;
  private readonly sessionsDir: string;
  
  /**
   * コンストラクタ
   */
  constructor() {
    // 設定の読み込み
    this.maxMessagesPerSession = config.MAX_MESSAGES_PER_SESSION || 10;
    this.sessionExpiryTimeMs = config.SESSION_EXPIRY_TIME_MS || 3600000; // デフォルト1時間
    this.persistSessions = config.PERSIST_SESSIONS || false;
    this.sessionsDir = config.SESSIONS_DIR || path.join(process.cwd(), 'conversation_history');
    
    // セッション永続化が有効なら、ディレクトリを作成
    if (this.persistSessions) {
      try {
        if (!fs.existsSync(this.sessionsDir)) {
          fs.mkdirSync(this.sessionsDir, { recursive: true });
          logger.info(`Created conversation history directory: ${this.sessionsDir}`);
        }
        
        // 保存されているセッションを読み込み
        this.loadSessions();
        
        // 定期的に古いセッションを削除
        setInterval(this.cleanupSessions.bind(this), 60000); // 1分ごとにクリーンアップ
      } catch (error) {
        logError(`Failed to initialize conversation manager: ${(error as Error).message}`);
      }
    }
  }
  
  /**
   * 新しい会話を作成
   * @param conversationId 会話ID
   * @returns 作成された会話セッション
   */
  public createConversation(conversationId: string): ConversationSession {
    // 会話IDからユーザーIDとチャンネルIDを生成
    const userId = conversationId;
    const channelId = conversationId;
    const guildId = 'default';
    
    // セッションの取得または作成
    return this.getOrCreateSession(userId, channelId, guildId);
  }

  /**
   * 会話にメッセージを追加
   * @param userIdOrConversationId ユーザーIDまたは会話ID
   * @param channelOrRole チャンネルIDまたはロール
   * @param guildIdOrContent ギルドIDまたはコンテンツ
   * @param content コンテンツ (オプション)
   * @param isAssistant アシスタントからのメッセージかどうか (オプション)
   * @returns 更新された会話セッション
   */
  public addMessage(userIdOrConversationId: string, channelOrRole: string | 'user' | 'assistant', 
                   guildIdOrContent: string, content?: string, isAssistant?: boolean): ConversationSession {
    
    // 引数の数に基づいて呼び出し方法を判断
    if (content !== undefined && isAssistant !== undefined) {
      // 5引数バージョン（従来の呼び出し）
      const userId = userIdOrConversationId;
      const channelId = channelOrRole as string;
      const guildId = guildIdOrContent;
      
      // ユーザーの会話セッションを取得または作成
      const session = this.getOrCreateSession(userId, channelId, guildId);
      
      // メッセージを追加
      session.messages.push({
        role: isAssistant ? 'assistant' : 'user',
        content,
        timestamp: Date.now()
      });
      
      // 最大メッセージ数を超えたら古いメッセージを削除
      if (session.messages.length > this.maxMessagesPerSession) {
        session.messages = session.messages.slice(-this.maxMessagesPerSession);
      }
      
      // 最終アクティビティ時間を更新
      session.lastActivity = Date.now();
      
      // セッションを保存
      if (this.persistSessions) {
        this.saveSession(session);
      }
      
      return session;
    } else {
      // 3引数バージョン（新しい呼び出し）
      const conversationId = userIdOrConversationId;
      const role = channelOrRole as 'user' | 'assistant';
      const messageContent = guildIdOrContent;

      // 会話IDからユーザーIDとチャンネルIDを生成
      const userId = conversationId;
      const channelId = conversationId;
      const guildId = 'default';
      
      // ユーザーの会話セッションを取得または作成
      const session = this.getOrCreateSession(userId, channelId, guildId);
      
      // メッセージを追加
      session.messages.push({
        role: role,
        content: messageContent,
        timestamp: Date.now()
      });
      
      // 最大メッセージ数を超えたら古いメッセージを削除
      if (session.messages.length > this.maxMessagesPerSession) {
        session.messages = session.messages.slice(-this.maxMessagesPerSession);
      }
      
      // 最終アクティビティ時間を更新
      session.lastActivity = Date.now();
      
      // セッションを保存
      if (this.persistSessions) {
        this.saveSession(session);
      }
      
      return session;
    }
  }
  
  /**
   * ユーザーの会話履歴を取得
   * @param userId ユーザーID
   * @param channelId チャンネルID
   * @returns 会話履歴、セッションがない場合は空の配列
   */
  public getConversationHistory(userId: string, channelId: string): ConversationMessage[] {
    const userSessions = this.sessions.get(userId);
    if (!userSessions) return [];
    
    const session = userSessions.get(channelId);
    if (!session) return [];
    
    // 最終アクティビティ時間を更新
    session.lastActivity = Date.now();
    
    return [...session.messages];
  }
  
  /**
   * ユーザーの会話履歴をクリア
   * @param userId ユーザーID
   * @param channelId チャンネルID
   * @returns 成功したかどうか
   */
  public clearConversationHistory(userId: string, channelId: string): boolean {
    const userSessions = this.sessions.get(userId);
    if (!userSessions) return false;
    
    const session = userSessions.get(channelId);
    if (!session) return false;
    
    // メッセージをクリア
    session.messages = [];
    session.lastActivity = Date.now();
    
    // 永続化されているセッションを削除
    if (this.persistSessions) {
      const sessionPath = this.getSessionFilePath(userId, channelId);
      try {
        if (fs.existsSync(sessionPath)) {
          fs.unlinkSync(sessionPath);
          logger.debug(`Deleted session file: ${sessionPath}`);
        }
      } catch (error) {
        logError(`Failed to delete session file: ${(error as Error).message}`);
      }
    }
    
    return true;
  }
  
  /**
   * 会話セッションを取得または作成
   * @param userId ユーザーID
   * @param channelId チャンネルID
   * @param guildId ギルドID
   * @returns 会話セッション
   */
  private getOrCreateSession(userId: string, channelId: string, guildId: string): ConversationSession {
    // ユーザーのセッションマップを取得
    let userSessions = this.sessions.get(userId);
    if (!userSessions) {
      userSessions = new Map();
      this.sessions.set(userId, userSessions);
    }
    
    // チャンネルのセッションを取得
    let session = userSessions.get(channelId);
    if (!session) {
      // 新しいセッションを作成
      session = {
        userId,
        channelId,
        guildId,
        messages: [],
        lastActivity: Date.now()
      };
      userSessions.set(channelId, session);
    }
    
    return session;
  }
  
  /**
   * セッションをファイルに保存
   * @param session 保存するセッション
   */
  private saveSession(session: ConversationSession): void {
    if (!this.persistSessions) return;
    
    const sessionPath = this.getSessionFilePath(session.userId, session.channelId);
    
    try {
      fs.writeFileSync(
        sessionPath,
        JSON.stringify(session, null, 2),
        'utf8'
      );
      logger.debug(`Saved session to: ${sessionPath}`);
    } catch (error) {
      logError(`Failed to save session: ${(error as Error).message}`);
    }
  }
  
  /**
   * 保存されているセッションを読み込み
   */
  private loadSessions(): void {
    if (!this.persistSessions) return;
    
    try {
      // セッションディレクトリが存在するか確認
      if (!fs.existsSync(this.sessionsDir)) return;
      
      // ディレクトリ内のファイルを読み込み
      const files = fs.readdirSync(this.sessionsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(this.sessionsDir, file);
        
        try {
          // ファイルからセッションを読み込み
          const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ConversationSession;
          
          // 有効期限をチェック
          const isExpired = Date.now() - sessionData.lastActivity > this.sessionExpiryTimeMs;
          if (isExpired) {
            // 期限切れなら削除
            fs.unlinkSync(filePath);
            logger.debug(`Deleted expired session file: ${filePath}`);
            continue;
          }
          
          // セッションをメモリに追加
          let userSessions = this.sessions.get(sessionData.userId);
          if (!userSessions) {
            userSessions = new Map();
            this.sessions.set(sessionData.userId, userSessions);
          }
          
          userSessions.set(sessionData.channelId, sessionData);
          logger.debug(`Loaded session from: ${filePath}`);
        } catch (error) {
          logError(`Failed to load session from ${filePath}: ${(error as Error).message}`);
          // 破損したファイルを削除
          try {
            fs.unlinkSync(filePath);
            logger.debug(`Deleted corrupted session file: ${filePath}`);
          } catch (err) {
            logError(`Failed to delete corrupted session file: ${(err as Error).message}`);
          }
        }
      }
      
      logger.info(`Loaded ${this.sessions.size} user sessions from disk`);
    } catch (error) {
      logError(`Failed to load sessions: ${(error as Error).message}`);
    }
  }
  
  /**
   * 古いセッションのクリーンアップ
   */
  private cleanupSessions(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    // メモリ内のセッションをクリーンアップ
    for (const [userId, userSessions] of this.sessions.entries()) {
      for (const [channelId, session] of userSessions.entries()) {
        if (now - session.lastActivity > this.sessionExpiryTimeMs) {
          userSessions.delete(channelId);
          expiredCount++;
          
          // 永続化されているセッションも削除
          if (this.persistSessions) {
            const sessionPath = this.getSessionFilePath(userId, channelId);
            try {
              if (fs.existsSync(sessionPath)) {
                fs.unlinkSync(sessionPath);
              }
            } catch (error) {
              logError(`Failed to delete expired session file: ${(error as Error).message}`);
            }
          }
        }
      }
      
      // ユーザーのセッションがすべて削除された場合はユーザーエントリも削除
      if (userSessions.size === 0) {
        this.sessions.delete(userId);
      }
    }
    
    if (expiredCount > 0) {
      logger.debug(`Cleaned up ${expiredCount} expired conversation sessions`);
    }
  }
  
  /**
   * セッションファイルのパスを取得
   * @param userId ユーザーID
   * @param channelId チャンネルID
   * @returns ファイルパス
   */
  private getSessionFilePath(userId: string, channelId: string): string {
    return path.join(this.sessionsDir, `${userId}_${channelId}.json`);
  }
}

// シングルトンインスタンス
export const conversationManager = new ConversationManager();