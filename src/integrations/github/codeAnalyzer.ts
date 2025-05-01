/**
 * コード分析モジュール
 * コードの依存関係、複雑性、構造を分析するためのユーティリティ
 */

import * as fs from 'fs';
import * as path from 'path';
import logger, { logError } from '../../utils/logger';

export interface CodeAnalysisResult {
  imports: string[];
  exports: string[];
  complexity: number;
  functions: FunctionInfo[];
  classes: ClassInfo[];
}

export interface FunctionInfo {
  name: string;
  params: string[];
  returnType?: string;
  loc: number; // lines of code
  complexity: number;
}

export interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: string[];
}

/**
 * コードの依存関係を分析する
 * @param content ファイルの内容
 * @param language 言語タイプ ('javascript', 'typescript', 'python')
 */
export async function analyzeCodeDependencies(
  content: string,
  language: string
): Promise<CodeAnalysisResult> {
  // 基本的な解析結果の初期化
  const result: CodeAnalysisResult = {
    imports: [],
    exports: [],
    complexity: 0,
    functions: [],
    classes: []
  };

  try {
    // 言語に応じた解析を実行
    switch (language) {
      case 'javascript':
      case 'typescript':
        return analyzeJsTs(content, language);
      case 'python':
        return analyzePython(content);
      default:
        logger.warn(`未サポートの言語: ${language}`);
        return result;
    }
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      logError(error, `コード分析エラー: ${(error as { message?: string }).message}`);
    } else {
      logError(error, 'コード分析エラー: 不明なエラー');
    }
    return result;
  }
}

/**
 * JavaScript/TypeScriptコードを分析
 */
function analyzeJsTs(content: string, language: string): CodeAnalysisResult {
  const result: CodeAnalysisResult = {
    imports: [],
    exports: [],
    complexity: 0,
    functions: [],
    classes: []
  };

  const lines = content.split('\n');
  
  // 単純な正規表現ベースの解析（実際の実装では構文解析ライブラリの使用が望ましい）
  
  // インポート文の検出
  const importRegex = /import\s+(?:(\*\s+as\s+\w+)|({[^}]+})|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  let importMatch;
  while ((importMatch = importRegex.exec(content)) !== null) {
    const importSource = importMatch[4];
    if (importSource) {
      result.imports.push(importSource);
    }
  }
  
  // require文の検出
  const requireRegex = /(?:const|let|var)\s+(?:(\w+)|({[^}]+}))\s+=\s+require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let requireMatch;
  while ((requireMatch = requireRegex.exec(content)) !== null) {
    const requireSource = requireMatch[3];
    if (requireSource) {
      result.imports.push(requireSource);
    }
  }
  
  // export文の検出
  const exportDefaultRegex = /export\s+default\s+(\w+)/g;
  let exportDefaultMatch;
  while ((exportDefaultMatch = exportDefaultRegex.exec(content)) !== null) {
    const exportName = exportDefaultMatch[1];
    if (exportName) {
      result.exports.push(exportName);
    }
  }
  
  const exportNamedRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
  let exportNamedMatch;
  while ((exportNamedMatch = exportNamedRegex.exec(content)) !== null) {
    const exportName = exportNamedMatch[1];
    if (exportName) {
      result.exports.push(exportName);
    }
  }
  
  // 関数の検出
  const functionRegex = /(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\([^)]*\)|=[^=])/g;
  let functionMatch;
  while ((functionMatch = functionRegex.exec(content)) !== null) {
    const functionName = functionMatch[1];
    if (functionName) {
      // 非常に単純な複雑性計算（条件分岐、ループの数をカウント）
      const functionStart = content.indexOf(functionMatch[0]);
      let openBrace = content.indexOf('{', functionStart);
      if (openBrace === -1) continue;
      
      let closeBrace = findClosingBrace(content, openBrace);
      if (closeBrace === -1) continue;
      
      const functionBody = content.substring(openBrace, closeBrace + 1);
      const complexity = calculateComplexity(functionBody);
      
      // 行数をカウント
      const loc = functionBody.split('\n').length;
      
      result.functions.push({
        name: functionName,
        params: [], // 本格的な実装では引数を抽出
        loc,
        complexity
      });
    }
  }
  
  // クラスの検出
  const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{/g;
  let classMatch;
  while ((classMatch = classRegex.exec(content)) !== null) {
    const className = classMatch[1];
    if (className) {
      result.classes.push({
        name: className,
        methods: [], // 本格的な実装ではメソッド抽出
        properties: [] // 本格的な実装ではプロパティ抽出
      });
    }
  }
  
  // 複雑性の計算（条件分岐、ループの数）
  result.complexity = calculateComplexity(content);
  
  return result;
}

/**
 * Pythonコードを分析
 */
function analyzePython(content: string): CodeAnalysisResult {
  const result: CodeAnalysisResult = {
    imports: [],
    exports: [],
    complexity: 0,
    functions: [],
    classes: []
  };

  const lines = content.split('\n');
  
  // インポート文の検出
  const importRegex = /import\s+(\w+)|from\s+([^\s]+)\s+import\s+([^#\n]+)/g;
  let importMatch;
  while ((importMatch = importRegex.exec(content)) !== null) {
    if (importMatch[1]) {
      // 'import numpy' パターン
      result.imports.push(importMatch[1]);
    } else if (importMatch[2]) {
      // 'from x import y' パターン
      result.imports.push(importMatch[2]);
    }
  }
  
  // 関数の検出
  const functionRegex = /def\s+(\w+)\s*\(([^)]*)\):/g;
  let functionMatch;
  while ((functionMatch = functionRegex.exec(content)) !== null) {
    const functionName = functionMatch[1];
    if (functionName) {
      // パラメータを抽出
      const paramsStr = functionMatch[2].trim();
      const params = paramsStr.split(',').map(p => p.trim()).filter(p => p);
      
      // 関数本体を抽出するために関数の開始行を見つける
      const lines = content.substring(0, functionMatch.index).split('\n');
      const startLine = lines.length;
      
      // 非常に単純な複雑性計算
      const complexity = calculatePythonComplexity(content, functionMatch.index);
      
      result.functions.push({
        name: functionName,
        params,
        loc: 0, // 本格的な実装では行数をカウント
        complexity
      });
    }
  }
  
  // クラスの検出
  const classRegex = /class\s+(\w+)(?:\(([^)]*)\))?:/g;
  let classMatch;
  while ((classMatch = classRegex.exec(content)) !== null) {
    const className = classMatch[1];
    if (className) {
      result.classes.push({
        name: className,
        methods: [], // 本格的な実装ではメソッド抽出
        properties: [] // 本格的な実装ではプロパティ抽出
      });
    }
  }
  
  // 全体の複雑性
  result.complexity = calculatePythonComplexity(content, 0);
  
  return result;
}

/**
 * コードの複雑性を計算（JS/TS）
 */
function calculateComplexity(code: string): number {
  let complexity = 1; // 基本複雑性
  
  // 条件分岐
  complexity += (code.match(/if\s*\(/g) || []).length;
  complexity += (code.match(/else\s*{/g) || []).length;
  complexity += (code.match(/else\s+if\s*\(/g) || []).length;
  complexity += (code.match(/switch\s*\(/g) || []).length;
  complexity += (code.match(/case\s+/g) || []).length;
  
  // ループ
  complexity += (code.match(/for\s*\(/g) || []).length;
  complexity += (code.match(/while\s*\(/g) || []).length;
  complexity += (code.match(/do\s*{/g) || []).length;
  
  // 例外処理
  complexity += (code.match(/try\s*{/g) || []).length;
  complexity += (code.match(/catch\s*\(/g) || []).length;
  
  // 論理演算子
  complexity += (code.match(/&&/g) || []).length;
  complexity += (code.match(/\|\|/g) || []).length;
  
  return complexity;
}

/**
 * Pythonコードの複雑性を計算
 */
function calculatePythonComplexity(code: string, startIndex: number): number {
  let complexity = 1; // 基本複雑性
  
  // コード全体ではなく、指定された位置以降のコードを対象にする
  const codeToAnalyze = code.substring(startIndex);
  
  // 条件分岐
  complexity += (codeToAnalyze.match(/if\s+/g) || []).length;
  complexity += (codeToAnalyze.match(/elif\s+/g) || []).length;
  complexity += (codeToAnalyze.match(/else:/g) || []).length;
  
  // ループ
  complexity += (codeToAnalyze.match(/for\s+/g) || []).length;
  complexity += (codeToAnalyze.match(/while\s+/g) || []).length;
  
  // 例外処理
  complexity += (codeToAnalyze.match(/try:/g) || []).length;
  complexity += (codeToAnalyze.match(/except/g) || []).length;
  
  // 論理演算子
  complexity += (codeToAnalyze.match(/and/g) || []).length;
  complexity += (codeToAnalyze.match(/or/g) || []).length;
  
  return complexity;
}

/**
 * 対応する閉じ括弧を見つける
 */
function findClosingBrace(content: string, openBracePos: number): number {
  let depth = 1;
  for (let i = openBracePos + 1; i < content.length; i++) {
    if (content[i] === '{') {
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1; // 対応する閉じ括弧が見つからない
}
