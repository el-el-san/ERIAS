/**
 * TypeScript用のコード生成テンプレート
 * 各種プロジェクト構造、コンポーネント、機能に対するTypeScriptコードテンプレート
 */

import { config } from '../../../config/config';

export interface TemplateParams {
  className?: string;
  interfaceName?: string;
  functionName?: string;
  imports?: string[];
  methods?: MethodParams[];
  properties?: PropertyParams[];
  description?: string;
  fileName?: string;
  author?: string;
  date?: string;
  projectName?: string;
  moduleName?: string;
}

export interface MethodParams {
  name: string;
  params?: Array<{ name: string; type: string; description?: string }>;
  returnType?: string;
  description?: string;
  isAsync?: boolean;
  visibility?: 'public' | 'private' | 'protected';
  isStatic?: boolean;
}

export interface PropertyParams {
  name: string;
  type: string;
  defaultValue?: string;
  description?: string;
  visibility?: 'public' | 'private' | 'protected';
  isReadonly?: boolean;
  isStatic?: boolean;
}

/**
 * ファイルヘッダーコメントを生成
 */
export function generateFileHeaderComment(params: TemplateParams): string {
  const date = params.date || new Date().toISOString().split('T')[0];
  
  return `/**
 * ${params.description || `${params.fileName} - ${params.projectName || 'Project'}`}
 * 
 * ${params.description ? '' : 'このファイルの説明'}
 * 
 * @file ${params.fileName || 'ファイル名'}
 * @author ${params.author || 'ERIAS AI'}
 * @date ${date}
 */

`;
}

/**
 * クラステンプレートを生成
 */
export function generateClassTemplate(params: TemplateParams): string {
  let code = generateFileHeaderComment(params);
  
  // インポート文の生成
  if (params.imports && params.imports.length > 0) {
    params.imports.forEach(importItem => {
      code += `import ${importItem};\n`;
    });
    code += '\n';
  }
  
  // クラス説明コメント
  code += `/**
 * ${params.className} クラス
 * ${params.description || ''}
 */\n`;
  
  // クラス定義の開始
  code += `export class ${params.className} {\n`;
  
  // プロパティの生成
  if (params.properties && params.properties.length > 0) {
    params.properties.forEach(prop => {
      // プロパティコメント
      if (prop.description) {
        code += `  /**\n   * ${prop.description}\n   */\n`;
      }
      
      // 可視性/読み取り専用/静的修飾子
      const modifiers = [];
      if (prop.visibility) modifiers.push(prop.visibility);
      if (prop.isReadonly) modifiers.push('readonly');
      if (prop.isStatic) modifiers.push('static');
      
      const modifiersStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
      
      // デフォルト値の付与
      const defaultValueStr = prop.defaultValue ? ` = ${prop.defaultValue}` : '';
      
      code += `  ${modifiersStr}${prop.name}: ${prop.type}${defaultValueStr};\n\n`;
    });
  }
  
  // コンストラクタの生成
  if (params.properties && params.properties.some(p => p.visibility === 'private' || p.visibility === 'protected')) {
    const constructorParams = params.properties
      .filter(p => p.visibility === 'private' || p.visibility === 'protected')
      .map(p => `${p.name}: ${p.type}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`)
      .join(', ');
    
    code += `  /**\n   * コンストラクタ\n   */\n`;
    code += `  constructor(${constructorParams}) {\n`;
    
    params.properties
      .filter(p => p.visibility === 'private' || p.visibility === 'protected')
      .forEach(p => {
        code += `    this.${p.name} = ${p.name};\n`;
      });
    
    code += `  }\n\n`;
  }
  
  // メソッドの生成
  if (params.methods && params.methods.length > 0) {
    params.methods.forEach(method => {
      // メソッドコメント
      code += `  /**\n   * ${method.description || method.name}\n`;
      
      // パラメータのコメント
      if (method.params && method.params.length > 0) {
        method.params.forEach(param => {
          code += `   * @param ${param.name} ${param.description || ''}\n`;
        });
      }
      
      // 戻り値のコメント
      if (method.returnType && method.returnType !== 'void') {
        code += `   * @returns ${method.description ? '処理結果' : ''}\n`;
      }
      
      code += `   */\n`;
      
      // 可視性/静的修飾子
      const modifiers = [];
      if (method.visibility) modifiers.push(method.visibility);
      if (method.isStatic) modifiers.push('static');
      if (method.isAsync) modifiers.push('async');
      
      const modifiersStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
      
      // パラメータの生成
      const paramsStr = method.params 
        ? method.params.map(p => `${p.name}: ${p.type}`).join(', ') 
        : '';
      
      // 戻り値の型
      const returnTypeStr = method.returnType ? `: ${method.returnType}` : '';
      
      // メソッド定義
      code += `  ${modifiersStr}${method.name}(${paramsStr})${returnTypeStr} {\n`;
      code += `    // TODO: 実装\n`;
      
      // 戻り値があれば適切なデフォルト値を返す
      if (method.returnType && method.returnType !== 'void') {
        if (method.returnType.includes('Promise')) {
          const innerType = method.returnType.match(/Promise<(.+)>/)?.[1] || 'any';
          if (innerType === 'boolean') {
            code += `    return Promise.resolve(false);\n`;
          } else if (innerType === 'number') {
            code += `    return Promise.resolve(0);\n`;
          } else if (innerType === 'string') {
            code += `    return Promise.resolve('');\n`;
          } else if (innerType.startsWith('Array') || innerType.includes('[]')) {
            code += `    return Promise.resolve([]);\n`;
          } else {
            code += `    return Promise.resolve({} as ${innerType});\n`;
          }
        } else {
          if (method.returnType === 'boolean') {
            code += `    return false;\n`;
          } else if (method.returnType === 'number') {
            code += `    return 0;\n`;
          } else if (method.returnType === 'string') {
            code += `    return '';\n`;
          } else if (method.returnType.startsWith('Array') || method.returnType.includes('[]')) {
            code += `    return [];\n`;
          } else {
            code += `    return {} as ${method.returnType};\n`;
          }
        }
      }
      
      code += `  }\n\n`;
    });
  }
  
  // クラス定義の終了
  code += `}\n`;
  
  return code;
}

/**
 * インターフェース定義を生成
 */
export function generateInterfaceTemplate(params: TemplateParams): string {
  let code = generateFileHeaderComment(params);
  
  // インポート文の生成
  if (params.imports && params.imports.length > 0) {
    params.imports.forEach(importItem => {
      code += `import ${importItem};\n`;
    });
    code += '\n';
  }
  
  // インターフェース説明コメント
  code += `/**
 * ${params.interfaceName} インターフェース
 * ${params.description || ''}
 */\n`;
  
  // インターフェース定義の開始
  code += `export interface ${params.interfaceName} {\n`;
  
  // プロパティの生成
  if (params.properties && params.properties.length > 0) {
    params.properties.forEach(prop => {
      // プロパティコメント
      if (prop.description) {
        code += `  /**\n   * ${prop.description}\n   */\n`;
      }
      
      // オプショナルプロパティの判定（デフォルト値がある場合）
      const isOptional = !!prop.defaultValue;
      
      code += `  ${prop.name}${isOptional ? '?' : ''}: ${prop.type};\n\n`;
    });
  }
  
  // メソッドの生成
  if (params.methods && params.methods.length > 0) {
    params.methods.forEach(method => {
      // メソッドコメント
      if (method.description) {
        code += `  /**\n   * ${method.description}\n`;
        
        // パラメータのコメント
        if (method.params && method.params.length > 0) {
          method.params.forEach(param => {
            if (param.description) {
              code += `   * @param ${param.name} ${param.description}\n`;
            }
          });
        }
        
        code += `   */\n`;
      }
      
      // パラメータの生成
      const paramsStr = method.params 
        ? method.params.map(p => `${p.name}: ${p.type}`).join(', ') 
        : '';
      
      // 戻り値の型
      const returnTypeStr = method.returnType ? `: ${method.returnType}` : '';
      
      // メソッド定義
      code += `  ${method.name}(${paramsStr})${returnTypeStr};\n\n`;
    });
  }
  
  // インターフェース定義の終了
  code += `}\n`;
  
  return code;
}

/**
 * 型定義ファイルを生成
 */
export function generateTypesTemplate(params: TemplateParams): string {
  let code = generateFileHeaderComment(params);
  
  // インポート文の生成
  if (params.imports && params.imports.length > 0) {
    params.imports.forEach(importItem => {
      code += `import ${importItem};\n`;
    });
    code += '\n';
  }
  
  // 型定義グループのコメント
  code += `/**
 * ${params.moduleName || params.projectName} に関連する型定義
 */\n\n`;
  
  // インターフェース定義（複数可）
  if (params.interfaceName) {
    // 単一インターフェースの場合
    code += `/**
 * ${params.interfaceName} インターフェース
 * ${params.description || ''}
 */\n`;
    
    code += `export interface ${params.interfaceName} {\n`;
    
    // プロパティの生成
    if (params.properties && params.properties.length > 0) {
      params.properties.forEach(prop => {
        // オプショナルプロパティの判定（デフォルト値がある場合）
        const isOptional = !!prop.defaultValue;
        
        if (prop.description) {
          code += `  /**\n   * ${prop.description}\n   */\n`;
        }
        code += `  ${prop.name}${isOptional ? '?' : ''}: ${prop.type};\n`;
      });
    }
    
    code += `}\n\n`;
  }
  
  // 追加の型定義があれば仮のものを追加
  code += `// TODO: 追加の型定義をここに記述\n\n`;
  code += `/*
例:
export interface SampleConfig {
  apiKey: string;
  timeout: number;
  retries?: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
*/\n`;
  
  return code;
}

/**
 * ユーティリティ関数ファイルを生成
 */
export function generateUtilTemplate(params: TemplateParams): string {
  let code = generateFileHeaderComment(params);
  
  // インポート文の生成
  if (params.imports && params.imports.length > 0) {
    params.imports.forEach(importItem => {
      code += `import ${importItem};\n`;
    });
    code += '\n';
  }
  
  // ユーティリティ関数の生成
  if (params.methods && params.methods.length > 0) {
    params.methods.forEach(method => {
      // 関数コメント
      code += `/**\n * ${method.description || method.name}\n`;
      
      // パラメータのコメント
      if (method.params && method.params.length > 0) {
        method.params.forEach(param => {
          code += ` * @param ${param.name} ${param.description || ''}\n`;
        });
      }
      
      // 戻り値のコメント
      if (method.returnType && method.returnType !== 'void') {
        code += ` * @returns ${method.description ? '処理結果' : ''}\n`;
      }
      
      code += ` */\n`;
      
      // async修飾子
      const asyncStr = method.isAsync ? 'async ' : '';
      
      // パラメータの生成
      const paramsStr = method.params 
        ? method.params.map(p => `${p.name}: ${p.type}`).join(', ') 
        : '';
      
      // 戻り値の型
      const returnTypeStr = method.returnType ? `: ${method.returnType}` : '';
      
      // 関数定義
      code += `export ${asyncStr}function ${method.name}(${paramsStr})${returnTypeStr} {\n`;
      code += `  // TODO: 実装\n`;
      
      // 戻り値があれば適切なデフォルト値を返す
      if (method.returnType && method.returnType !== 'void') {
        if (method.returnType.includes('Promise')) {
          const innerType = method.returnType.match(/Promise<(.+)>/)?.[1] || 'any';
          if (innerType === 'boolean') {
            code += `  return Promise.resolve(false);\n`;
          } else if (innerType === 'number') {
            code += `  return Promise.resolve(0);\n`;
          } else if (innerType === 'string') {
            code += `  return Promise.resolve('');\n`;
          } else if (innerType.startsWith('Array') || innerType.includes('[]')) {
            code += `  return Promise.resolve([]);\n`;
          } else {
            code += `  return Promise.resolve({} as ${innerType});\n`;
          }
        } else {
          if (method.returnType === 'boolean') {
            code += `  return false;\n`;
          } else if (method.returnType === 'number') {
            code += `  return 0;\n`;
          } else if (method.returnType === 'string') {
            code += `  return '';\n`;
          } else if (method.returnType.startsWith('Array') || method.returnType.includes('[]')) {
            code += `  return [];\n`;
          } else {
            code += `  return {} as ${method.returnType};\n`;
          }
        }
      }
      
      code += `}\n\n`;
    });
  } else {
    // デフォルトのユーティリティ関数サンプル
    code += `/**
 * 指定された時間だけ待機する
 * @param ms 待機時間（ミリ秒）
 * @returns 待機を解決するPromise
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 文字列がnullまたは空かどうかをチェックする
 * @param str チェックする文字列
 * @returns nullまたは空の場合はtrue、それ以外はfalse
 */
export function isNullOrEmpty(str: string | null | undefined): boolean {
  return str === null || str === undefined || str.trim() === '';
}

/**
 * 配列をチャンクに分割する
 * @param array 分割する配列
 * @param chunkSize チャンクサイズ
 * @returns チャンクの配列
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
}
\n`;
  }
  
  return code;
}

/**
 * テストファイルを生成
 */
export function generateTestTemplate(params: TemplateParams): string {
  // テスト対象のファイル名から拡張子を除いた名前を取得
  const baseName = params.fileName?.replace(/\.ts$/, '') || 'unknownModule';
  
  let code = `/**
 * ${baseName} のテスト
 * 
 * @file ${baseName}.test.ts
 * @author ${params.author || 'ERIAS AI'}
 * @date ${params.date || new Date().toISOString().split('T')[0]}
 */

import { ${params.className || baseName} } from './${baseName}';\n\n`;
  
  // Jestのテストコード
  code += `describe('${params.className || baseName}', () => {\n`;
  
  if (params.methods && params.methods.length > 0) {
    params.methods.forEach(method => {
      code += `  describe('${method.name}', () => {\n`;
      code += `    test('正常系: 期待通りに動作する', () => {\n`;
      code += `      // テストのセットアップ\n`;
      
      // インスタンス生成またはメソッド呼び出し
      if (method.isStatic) {
        code += `      // 静的メソッドのテスト\n`;
        code += `      const result = ${params.className || baseName}.${method.name}();\n`;
      } else {
        code += `      // インスタンスを生成\n`;
        code += `      const instance = new ${params.className || baseName}();\n`;
        code += `      // メソッドを呼び出し\n`;
        code += `      const result = instance.${method.name}();\n`;
      }
      
      code += `      // 結果を検証\n`;
      code += `      expect(result).toBeDefined();\n`;
      code += `    });\n\n`;
      
      code += `    test('異常系: エラーハンドリングが機能する', () => {\n`;
      code += `      // TODO: 異常系のテストを実装\n`;
      code += `      // エラーケースの検証\n`;
      code += `      expect(() => {\n`;
      
      if (method.isStatic) {
        code += `        ${params.className || baseName}.${method.name}(/* 無効な引数 */);\n`;
      } else {
        code += `        const instance = new ${params.className || baseName}();\n`;
        code += `        instance.${method.name}(/* 無効な引数 */);\n`;
      }
      
      code += `      }).not.toThrow();\n`;
      code += `    });\n`;
      code += `  });\n\n`;
    });
  } else {
    // デフォルトのテストケース
    code += `  // デフォルトテスト\n`;
    code += `  test('インスタンス化が可能', () => {\n`;
    code += `    const instance = new ${params.className || baseName}();\n`;
    code += `    expect(instance).toBeDefined();\n`;
    code += `    expect(instance).toBeInstanceOf(${params.className || baseName});\n`;
    code += `  });\n\n`;
    
    code += `  test('基本機能が動作する', () => {\n`;
    code += `    // TODO: 実際のテストケースを実装\n`;
    code += `    expect(true).toBe(true);\n`;
    code += `  });\n`;
  }
  
  code += `});\n`;
  
  return code;
}

/**
 * React コンポーネントを生成
 */
export function generateReactComponentTemplate(params: TemplateParams): string {
  const componentName = params.className || 'Component';
  
  let code = generateFileHeaderComment({
    ...params,
    description: `${componentName} Reactコンポーネント`
  });
  
  // インポート文
  code += `import React, { useState, useEffect } from 'react';\n`;
  
  if (params.imports && params.imports.length > 0) {
    params.imports.forEach(importItem => {
      code += `import ${importItem};\n`;
    });
  }
  
  code += `\n`;
  
  // Props型定義
  code += `/**
 * ${componentName}のProps
 */
interface ${componentName}Props {\n`;
  
  if (params.properties && params.properties.length > 0) {
    params.properties.forEach(prop => {
      if (prop.description) {
        code += `  /** ${prop.description} */\n`;
      }
      const optional = prop.defaultValue ? '?' : '';
      code += `  ${prop.name}${optional}: ${prop.type};\n`;
    });
  } else {
    code += `  // TODO: Props定義\n`;
    code += `  className?: string;\n`;
  }
  
  code += `}\n\n`;
  
  // コンポーネント
  code += `/**
 * ${componentName} コンポーネント
 * ${params.description || ''}
 */
const ${componentName}: React.FC<${componentName}Props> = ({\n`;
  
  // Propsの分割代入
  if (params.properties && params.properties.length > 0) {
    const propsWithDefaults = params.properties.map(prop => {
      if (prop.defaultValue) {
        return `  ${prop.name} = ${prop.defaultValue}`;
      }
      return `  ${prop.name}`;
    }).join(',\n');
    code += `${propsWithDefaults}\n`;
  } else {
    code += `  className = ''\n`;
  }
  
  code += `}) => {\n`;
  
  // State定義
  code += `  // State定義\n`;
  code += `  const [state, setState] = useState<any>(null);\n\n`;
  
  // useEffectフック
  code += `  // コンポーネントマウント時の処理\n`;
  code += `  useEffect(() => {\n`;
  code += `    // TODO: マウント時の処理を実装\n`;
  code += `    return () => {\n`;
  code += `      // TODO: アンマウント時のクリーンアップ\n`;
  code += `    };\n`;
  code += `  }, []);\n\n`;
  
  // イベントハンドラ
  code += `  // イベントハンドラ\n`;
  code += `  const handleClick = () => {\n`;
  code += `    // TODO: クリックイベント処理を実装\n`;
  code += `  };\n\n`;
  
  // レンダリング
  code += `  // レンダリング\n`;
  code += `  return (\n`;
  code += `    <div className={className}>\n`;
  code += `      <h2>${componentName}</h2>\n`;
  code += `      {/* TODO: コンポーネントの内容を実装 */}\n`;
  code += `      <button onClick={handleClick}>Click me</button>\n`;
  code += `    </div>\n`;
  code += `  );\n`;
  code += `};\n\n`;
  
  // エクスポート
  code += `export default ${componentName};\n`;
  
  return code;
}

/**
 * ファイルタイプに応じたテンプレート生成を行う
 */
export function generateTemplateByType(
  type: 'class' | 'interface' | 'types' | 'util' | 'test' | 'react',
  params: TemplateParams
): string {
  switch (type) {
    case 'class':
      return generateClassTemplate(params);
    case 'interface':
      return generateInterfaceTemplate(params);
    case 'types':
      return generateTypesTemplate(params);
    case 'util':
      return generateUtilTemplate(params);
    case 'test':
      return generateTestTemplate(params);
    case 'react':
      return generateReactComponentTemplate(params);
    default:
      return `// Unknown template type: ${type}`;
  }
}
