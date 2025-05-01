/**
 * 言語/フレームワーク検出モジュール
 * ファイルやコードの言語、フレームワークを検出するためのユーティリティ
 */

import * as path from 'path';
import * as fs from 'fs';
import logger, { logError } from '../../utils/logger';

/**
 * ファイルの拡張子から言語タイプを検出
 */
export function getFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    // JavaScript関連
    case '.js':
      return 'javascript';
    case '.jsx':
      return 'javascript_react';
    case '.mjs':
      return 'javascript_module';
    case '.cjs':
      return 'javascript_commonjs';
      
    // TypeScript関連
    case '.ts':
      return 'typescript';
    case '.tsx':
      return 'typescript_react';
    case '.d.ts':
      return 'typescript_declaration';
      
    // HTML/CSS関連
    case '.html':
    case '.htm':
      return 'html';
    case '.css':
      return 'css';
    case '.scss':
      return 'scss';
    case '.sass':
      return 'sass';
    case '.less':
      return 'less';
    
    // Python関連
    case '.py':
      return 'python';
    case '.ipynb':
      return 'jupyter_notebook';
      
    // JSON/設定ファイル
    case '.json':
      return 'json';
    case '.yaml':
    case '.yml':
      return 'yaml';
    case '.toml':
      return 'toml';
    case '.ini':
      return 'ini';
    case '.env':
      return 'env';
      
    // Markdown/ドキュメント
    case '.md':
      return 'markdown';
    case '.mdx':
      return 'mdx';
    case '.txt':
      return 'text';
      
    // その他
    case '.sh':
      return 'shell';
    case '.bat':
      return 'batch';
    case '.xml':
      return 'xml';
    case '.svg':
      return 'svg';
      
    default:
      // 拡張子のないファイル名の特殊処理
      const basename = path.basename(filePath).toLowerCase();
      
      if (basename === 'dockerfile') return 'dockerfile';
      if (basename === 'makefile') return 'makefile';
      if (basename === '.gitignore') return 'gitignore';
      if (basename === '.npmignore') return 'npmignore';
      if (basename === '.dockerignore') return 'dockerignore';
      if (basename === 'package.json') return 'package_json';
      if (basename === 'tsconfig.json') return 'tsconfig';
      
      return 'unknown';
  }
}

/**
 * ファイルパスからプログラミング言語を検出
 */
export function detectLanguage(filePath: string): string {
  const fileType = getFileType(filePath);
  
  // 言語マッピング
  const languageMap: Record<string, string> = {
    'javascript': 'JavaScript',
    'javascript_react': 'JavaScript',
    'javascript_module': 'JavaScript',
    'javascript_commonjs': 'JavaScript',
    'typescript': 'TypeScript',
    'typescript_react': 'TypeScript',
    'typescript_declaration': 'TypeScript',
    'python': 'Python',
    'jupyter_notebook': 'Python',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'sass': 'Sass',
    'less': 'Less',
    'json': 'JSON',
    'yaml': 'YAML',
    'toml': 'TOML',
    'shell': 'Shell',
    'batch': 'Batch',
    'dockerfile': 'Dockerfile',
    'makefile': 'Makefile'
  };
  
  return languageMap[fileType] || 'Unknown';
}

/**
 * ファイルやディレクトリ構造からフレームワークを検出
 * @param rootDir リポジトリのルートディレクトリ
 */
export function detectFramework(rootDir: string): string[] {
  const frameworks: string[] = [];
  
  try {
    // package.jsonの解析
    const packageJsonPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };
      
      // JavaScriptフレームワーク検出
      if ('react' in allDeps) frameworks.push('React');
      if ('vue' in allDeps) frameworks.push('Vue.js');
      if ('angular' in allDeps || '@angular/core' in allDeps) frameworks.push('Angular');
      if ('next' in allDeps) frameworks.push('Next.js');
      if ('nuxt' in allDeps) frameworks.push('Nuxt.js');
      if ('svelte' in allDeps) frameworks.push('Svelte');
      
      // バックエンドフレームワーク検出
      if ('express' in allDeps) frameworks.push('Express');
      if ('@nestjs/core' in allDeps) frameworks.push('Nest.js');
      if ('koa' in allDeps) frameworks.push('Koa');
      if ('fastify' in allDeps) frameworks.push('Fastify');
      if ('hapi' in allDeps) frameworks.push('Hapi');
    }
    
    // requirements.txtの解析（Python）
    const requirementsPath = path.join(rootDir, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      const requirements = fs.readFileSync(requirementsPath, 'utf-8');
      
      if (requirements.includes('flask')) frameworks.push('Flask');
      if (requirements.includes('django')) frameworks.push('Django');
      if (requirements.includes('fastapi')) frameworks.push('FastAPI');
    }
    
    // 特殊ファイルの存在チェック
    if (fs.existsSync(path.join(rootDir, 'angular.json'))) frameworks.push('Angular');
    if (fs.existsSync(path.join(rootDir, 'next.config.js'))) frameworks.push('Next.js');
    if (fs.existsSync(path.join(rootDir, 'nuxt.config.js'))) frameworks.push('Nuxt.js');
    if (fs.existsSync(path.join(rootDir, 'svelte.config.js'))) frameworks.push('Svelte');
    if (fs.existsSync(path.join(rootDir, 'manage.py')) && 
        fs.existsSync(path.join(rootDir, 'settings.py'))) frameworks.push('Django');
    
    // 重複排除
    return [...new Set(frameworks)];
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      logError(error, `フレームワーク検出エラー: ${(error as { message?: string }).message}`);
    } else {
      logError(error, 'フレームワーク検出エラー: 不明なエラー');
    }
    return frameworks;
  }
}

/**
 * ファイル内容から特定のフレームワーク/ライブラリの利用を検出
 * @param content ファイルの内容
 * @param fileType ファイルタイプ
 */
export function detectLibrariesFromContent(content: string, fileType: string): string[] {
  const libraries: string[] = [];
  
  // JavaScript/TypeScript
  if (fileType.includes('javascript') || fileType.includes('typescript')) {
    // React
    if (content.includes('import React') || content.includes('from "react"') || 
        content.includes("from 'react'")) {
      libraries.push('React');
    }
    
    // Vue
    if (content.includes('import Vue') || content.includes('from "vue"') || 
        content.includes("from 'vue'")) {
      libraries.push('Vue.js');
    }
    
    // Angular
    if (content.includes('@angular/core') || content.includes('NgModule')) {
      libraries.push('Angular');
    }
    
    // Express
    if (content.includes('import express') || content.includes('require("express")') || 
        content.includes("require('express')")) {
      libraries.push('Express');
    }
  }
  
  // Python
  else if (fileType === 'python') {
    // Flask
    if (content.includes('import flask') || content.includes('from flask import')) {
      libraries.push('Flask');
    }
    
    // Django
    if (content.includes('import django') || content.includes('from django import')) {
      libraries.push('Django');
    }
    
    // FastAPI
    if (content.includes('import fastapi') || content.includes('from fastapi import')) {
      libraries.push('FastAPI');
    }
  }
  
  return libraries;
}
