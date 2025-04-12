import logger from '../utils/logger';

/**
 * Function Callingで使用するツール定義のインターフェース
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<any>;
}

/**
 * ツール登録と管理のためのレジストリ
 * LLMのFunction Calling機能用のツールを登録・管理する
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * ツールを登録
   * @param tool 登録するツール定義
   */
  public registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool with name '${tool.name}' is being overwritten`);
    }
    
    this.tools.set(tool.name, tool);
    logger.debug(`Tool registered: ${tool.name}`);
  }

  /**
   * 複数のツールを一括登録
   * @param tools 登録するツール定義の配列
   */
  public registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * 登録されたツールを取得
   * @param name ツール名
   */
  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 登録されたすべてのツールを配列として取得
   */
  public getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 特定のツールの登録を解除
   * @param name 解除するツール名
   */
  public unregisterTool(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      logger.debug(`Tool unregistered: ${name}`);
    }
    return result;
  }

  /**
   * すべてのツールの登録を解除
   */
  public clearTools(): void {
    this.tools.clear();
    logger.debug('All tools cleared from registry');
  }
}

// シングルトンのToolRegistryインスタンスをエクスポート
export const toolRegistry = new ToolRegistry();

export default toolRegistry;