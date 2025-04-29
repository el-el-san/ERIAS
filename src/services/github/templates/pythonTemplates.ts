/**
 * Python用のコード生成テンプレート
 * 各種プロジェクト構造、クラス、関数に対するPythonコードテンプレート
 */

export interface PythonTemplateParams {
  fileName?: string;
  moduleName?: string;
  className?: string;
  functionName?: string;
  imports?: string[];
  methods?: PythonMethodParams[];
  attributes?: PythonAttributeParams[];
  description?: string;
  author?: string;
  date?: string;
  projectName?: string;
  isAsync?: boolean;
  pythonVersion?: string;
}

export interface PythonMethodParams {
  name: string;
  params?: Array<{ name: string; type?: string; defaultValue?: string; description?: string }>;
  returnType?: string;
  description?: string;
  isAsync?: boolean;
  isStatic?: boolean;
  isPrivate?: boolean;
}

export interface PythonAttributeParams {
  name: string;
  type?: string;
  defaultValue?: string;
  description?: string;
  isPrivate?: boolean;
  isClassVar?: boolean;
}

/**
 * Pythonモジュールのヘッダーコメントを生成
 */
export function generatePythonHeaderComment(params: PythonTemplateParams): string {
  const date = params.date || new Date().toISOString().split('T')[0];
  const pythonVersion = params.pythonVersion || '3.8+';
  
  return `#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
${params.description || `${params.fileName} - ${params.projectName || 'Project'}`}

${params.description ? '' : 'このモジュールの説明'}

Author: ${params.author || 'ERIAS AI'}
Date: ${date}
Python: ${pythonVersion}
"""

`;
}

/**
 * Pythonのインポート文を生成
 */
export function generatePythonImports(imports?: string[]): string {
  if (!imports || imports.length === 0) {
    return `# 標準ライブラリ
import os
import sys
from typing import List, Dict, Optional, Any, Union

# サードパーティライブラリ
# import requests

# ローカルモジュール
# from . import module

`;
  }
  
  // インポートを標準ライブラリ、サードパーティ、ローカルモジュールに分類
  const stdLibs: string[] = [];
  const thirdParty: string[] = [];
  const local: string[] = [];
  
  const stdLibsList = [
    'os', 'sys', 'time', 'datetime', 'logging', 'json', 'math', 'random',
    're', 'collections', 'itertools', 'functools', 'typing', 'pathlib', 
    'subprocess', 'argparse', 'unittest', 'asyncio', 'csv', 'io', 'shutil'
  ];
  
  imports.forEach(imp => {
    const importName = imp.split(' ')[1]; // 'import xyz' or 'from xyz import abc' から xyz を抽出
    
    if (stdLibsList.includes(importName) || importName.startsWith('typing.')) {
      stdLibs.push(imp);
    } else if (importName.startsWith('.') || importName === '') {
      local.push(imp);
    } else {
      thirdParty.push(imp);
    }
  });
  
  let code = '';
  
  if (stdLibs.length > 0) {
    code += '# 標準ライブラリ\n';
    stdLibs.forEach(imp => code += `${imp}\n`);
    code += '\n';
  }
  
  if (thirdParty.length > 0) {
    code += '# サードパーティライブラリ\n';
    thirdParty.forEach(imp => code += `${imp}\n`);
    code += '\n';
  }
  
  if (local.length > 0) {
    code += '# ローカルモジュール\n';
    local.forEach(imp => code += `${imp}\n`);
    code += '\n';
  }
  
  return code;
}

/**
 * Pythonのクラス定義を生成
 */
export function generatePythonClassTemplate(params: PythonTemplateParams): string {
  let code = generatePythonHeaderComment(params);
  
  // インポート文の生成
  code += generatePythonImports(params.imports);
  
  // 定数・グローバル変数（任意）
  code += `# 定数・グローバル変数\n`;
  code += `# CONSTANT_VALUE = 42\n\n`;
  
  // クラス定義の開始
  code += `class ${params.className}:\n`;
  code += `    """\n`;
  code += `    ${params.description || `${params.className} クラス`}\n`;
  code += `    """\n\n`;
  
  // クラス変数の定義
  if (params.attributes && params.attributes.length > 0) {
    const classVars = params.attributes.filter(attr => attr.isClassVar);
    if (classVars.length > 0) {
      classVars.forEach(attr => {
        if (attr.description) {
          code += `    # ${attr.description}\n`;
        }
        
        const typingComment = attr.type ? ` # type: ${attr.type}` : '';
        const attrName = attr.isPrivate ? `_${attr.name}` : attr.name;
        
        if (attr.defaultValue) {
          code += `    ${attrName} = ${attr.defaultValue}${typingComment}\n`;
        } else {
          code += `    ${attrName} = None${typingComment}\n`;
        }
      });
      code += '\n';
    }
  }
  
  // コンストラクタの生成
  code += `    def __init__(self`;
  
  // コンストラクタの引数
  const instanceAttrs = params.attributes ? 
    params.attributes.filter(attr => !attr.isClassVar) : [];
  
  if (instanceAttrs.length > 0) {
    instanceAttrs.forEach(attr => {
      const paramName = attr.isPrivate ? `_${attr.name}` : attr.name;
      const typeHint = attr.type ? `: ${attr.type}` : '';
      const defaultValue = attr.defaultValue ? ` = ${attr.defaultValue}` : '';
      
      code += `, ${paramName}${typeHint}${defaultValue}`;
    });
  }
  
  code += `):\n`;
  code += `        """\n`;
  code += `        コンストラクタ\n`;
  
  // パラメータのドキュメント
  if (instanceAttrs.length > 0) {
    code += `\n`;
    instanceAttrs.forEach(attr => {
      const paramName = attr.isPrivate ? `_${attr.name}` : attr.name;
      code += `        Args:\n`;
      code += `            ${paramName}: ${attr.description || 'パラメータの説明'}\n`;
    });
  }
  
  code += `        """\n`;
  
  // インスタンス変数の初期化
  if (instanceAttrs.length > 0) {
    instanceAttrs.forEach(attr => {
      const attrName = attr.isPrivate ? `_${attr.name}` : attr.name;
      code += `        self.${attrName} = ${attrName}\n`;
    });
  } else {
    code += `        # インスタンス変数の初期化\n`;
    code += `        pass\n`;
  }
  
  code += '\n';
  
  // メソッドの生成
  if (params.methods && params.methods.length > 0) {
    params.methods.forEach(method => {
      // メソッド名（プライベートの場合は接頭辞を追加）
      const methodName = method.isPrivate ? `_${method.name}` : method.name;
      
      // 静的メソッドの装飾子
      if (method.isStatic) {
        code += `    @staticmethod\n`;
      }
      
      // 非同期メソッドの場合
      const asyncPrefix = method.isAsync ? 'async ' : '';
      
      // self引数（静的メソッドの場合は不要）
      const selfArg = method.isStatic ? '' : 'self';
      
      // メソッド定義の開始
      code += `    def ${methodName}(${selfArg}`;
      
      // メソッドの引数
      if (method.params && method.params.length > 0) {
        if (selfArg) code += ', ';
        
        method.params.forEach((param, index) => {
          const typeHint = param.type ? `: ${param.type}` : '';
          const defaultValue = param.defaultValue ? ` = ${param.defaultValue}` : '';
          
          code += `${param.name}${typeHint}${defaultValue}`;
          
          if (method.params && index < method.params.length - 1) {
            code += ', ';
          }
        });
      }
      
      // 戻り値の型ヒント
      const returnType = method.returnType ? ` -> ${method.returnType}` : '';
      
      code += `)${returnType}:\n`;
      
      // メソッドのドキュメント
      code += `        """\n`;
      code += `        ${method.description || `${methodName} メソッド`}\n`;
      
      // パラメータのドキュメント
      if (method.params && method.params.length > 0) {
        code += `\n`;
        code += `        Args:\n`;
        method.params.forEach(param => {
          code += `            ${param.name}: ${param.description || 'パラメータの説明'}\n`;
        });
      }
      
      // 戻り値のドキュメント
      if (method.returnType && method.returnType !== 'None') {
        code += `\n`;
        code += `        Returns:\n`;
        code += `            ${method.returnType}: 戻り値の説明\n`;
      }
      
      code += `        """\n`;
      
      // メソッド本体
      code += `        # TODO: 実装\n`;
      
      // 戻り値があれば適切なデフォルト値を返す
      if (method.returnType && method.returnType !== 'None') {
        if (method.returnType.includes('List') || method.returnType.includes('list')) {
          code += `        return []\n`;
        } else if (method.returnType.includes('Dict') || method.returnType.includes('dict')) {
          code += `        return {}\n`;
        } else if (method.returnType.includes('str')) {
          code += `        return ""\n`;
        } else if (method.returnType.includes('int')) {
          code += `        return 0\n`;
        } else if (method.returnType.includes('float')) {
          code += `        return 0.0\n`;
        } else if (method.returnType.includes('bool')) {
          code += `        return False\n`;
        } else {
          code += `        return None\n`;
        }
      }
      
      code += '\n';
    });
  }
  
  // コードの最後にメインブロックを追加（オプション）
  code += `\n# メインエントリポイント\nif __name__ == "__main__":\n    # モジュールとして実行された場合の処理\n    pass\n`;
  
  return code;
}

/**
 * Python関数定義を生成
 */
export function generatePythonFunctionTemplate(params: PythonTemplateParams): string {
  let code = generatePythonHeaderComment(params);
  
  // インポート文の生成
  code += generatePythonImports(params.imports);
  
  // 定数・グローバル変数（任意）
  code += `# 定数・グローバル変数\n`;
  code += `# CONSTANT_VALUE = 42\n\n`;
  
  // 関数の生成
  if (params.methods && params.methods.length > 0) {
    params.methods.forEach(method => {
      // 非同期関数の場合
      const asyncPrefix = method.isAsync ? 'async ' : '';
      
      // 関数定義の開始
      code += `def ${method.name}(`;
      
      // 関数の引数
      if (method.params && method.params.length > 0) {
        method.params.forEach((param, index) => {
          const typeHint = param.type ? `: ${param.type}` : '';
          const defaultValue = param.defaultValue ? ` = ${param.defaultValue}` : '';
          
          code += `${param.name}${typeHint}${defaultValue}`;
          
          if (method.params && index < method.params.length - 1) {
            code += ', ';
          }
        });
      }
      
      // 戻り値の型ヒント
      const returnType = method.returnType ? ` -> ${method.returnType}` : '';
      
      code += `)${returnType}:\n`;
      
      // 関数のドキュメント
      code += `    """\n`;
      code += `    ${method.description || `${method.name} 関数`}\n`;
      
      // パラメータのドキュメント
      if (method.params && method.params.length > 0) {
        code += `\n`;
        code += `    Args:\n`;
        method.params.forEach(param => {
          code += `        ${param.name}: ${param.description || 'パラメータの説明'}\n`;
        });
      }
      
      // 戻り値のドキュメント
      if (method.returnType && method.returnType !== 'None') {
        code += `\n`;
        code += `    Returns:\n`;
        code += `        ${method.returnType}: 戻り値の説明\n`;
      }
      
      code += `    """\n`;
      
      // 関数本体
      code += `    # TODO: 実装\n`;
      
      // 戻り値があれば適切なデフォルト値を返す
      if (method.returnType && method.returnType !== 'None') {
        if (method.returnType.includes('List') || method.returnType.includes('list')) {
          code += `    return []\n`;
        } else if (method.returnType.includes('Dict') || method.returnType.includes('dict')) {
          code += `    return {}\n`;
        } else if (method.returnType.includes('str')) {
          code += `    return ""\n`;
        } else if (method.returnType.includes('int')) {
          code += `    return 0\n`;
        } else if (method.returnType.includes('float')) {
          code += `    return 0.0\n`;
        } else if (method.returnType.includes('bool')) {
          code += `    return False\n`;
        } else {
          code += `    return None\n`;
        }
      }
      
      code += '\n';
    });
  } else {
    // デフォルトの関数テンプレート
    code += `def main():\n`;
    code += `    """\n`;
    code += `    メイン関数\n`;
    code += `    """\n`;
    code += `    print("Hello, World!")\n\n`;
  }
  
  // コードの最後にメインブロックを追加
  code += `\n# メインエントリポイント\nif __name__ == "__main__":\n    # モジュールとして実行された場合の処理\n`;
  
  if (params.methods && params.methods.some(m => m.name === 'main')) {
    code += `    main()\n`;
  } else {
    code += `    # main関数がない場合はパス\n`;
    code += `    pass\n`;
  }
  
  return code;
}

/**
 * Pythonテストファイルを生成
 */
export function generatePythonTestTemplate(params: PythonTemplateParams): string {
  const moduleName = params.fileName?.replace(/\.py$/, '') || params.moduleName || 'module';
  const className = params.className;
  
  let code = `#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
${moduleName} のユニットテスト

Author: ${params.author || 'ERIAS AI'}
Date: ${params.date || new Date().toISOString().split('T')[0]}
"""

import unittest
`;

  // テスト対象のインポート
  if (className) {
    code += `from ${moduleName} import ${className}\n\n`;
  } else {
    code += `import ${moduleName}\n\n`;
  }
  
  // テストクラス
  if (className) {
    code += `class Test${className}(unittest.TestCase):\n`;
  } else {
    code += `class Test${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}(unittest.TestCase):\n`;
  }
  
  // セットアップとティアダウン
  code += `    def setUp(self):\n`;
  code += `        """テスト前の準備処理"""\n`;
  
  if (className) {
    code += `        self.instance = ${className}()\n`;
  }
  
  code += `        pass\n\n`;
  
  code += `    def tearDown(self):\n`;
  code += `        """テスト後のクリーンアップ処理"""\n`;
  code += `        pass\n\n`;
  
  // テストメソッド
  if (params.methods && params.methods.length > 0) {
    params.methods.forEach(method => {
      code += `    def test_${method.name}(self):\n`;
      code += `        """${method.name} のテスト"""\n`;
      
      if (method.isStatic) {
        // 静的メソッドのテスト
        if (className) {
          code += `        result = ${className}.${method.name}()\n`;
        } else {
          code += `        result = ${moduleName}.${method.name}()\n`;
        }
      } else if (className) {
        // インスタンスメソッドのテスト
        code += `        result = self.instance.${method.name}()\n`;
      } else {
        // 関数のテスト
        code += `        result = ${moduleName}.${method.name}()\n`;
      }
      
      // アサーション
      if (method.returnType) {
        if (method.returnType.includes('List') || method.returnType.includes('list')) {
          code += `        self.assertIsInstance(result, list)\n`;
        } else if (method.returnType.includes('Dict') || method.returnType.includes('dict')) {
          code += `        self.assertIsInstance(result, dict)\n`;
        } else if (method.returnType.includes('str')) {
          code += `        self.assertIsInstance(result, str)\n`;
        } else if (method.returnType.includes('int')) {
          code += `        self.assertIsInstance(result, int)\n`;
        } else if (method.returnType.includes('float')) {
          code += `        self.assertIsInstance(result, float)\n`;
        } else if (method.returnType.includes('bool')) {
          code += `        self.assertIsInstance(result, bool)\n`;
        } else if (method.returnType !== 'None') {
          code += `        self.assertIsNotNone(result)\n`;
        }
      } else {
        code += `        # TODO: 適切なアサーションを追加\n`;
        code += `        pass\n`;
      }
      
      code += '\n';
    });
  } else {
    // デフォルトのテストメソッド
    code += `    def test_something(self):\n`;
    code += `        """基本機能のテスト"""\n`;
    code += `        # TODO: 適切なテストを実装\n`;
    code += `        self.assertTrue(True)\n\n`;
  }
  
  // メインブロック
  code += `\nif __name__ == "__main__":\n`;
  code += `    unittest.main()\n`;
  
  return code;
}

/**
 * Flask アプリケーションテンプレートを生成
 */
export function generateFlaskAppTemplate(params: PythonTemplateParams): string {
  const appName = params.projectName || 'flask_app';
  
  let code = `#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
${params.description || `${appName} - Flask Web Application`}

Author: ${params.author || 'ERIAS AI'}
Date: ${params.date || new Date().toISOString().split('T')[0]}
"""

from flask import Flask, request, jsonify, render_template
import os
from typing import Dict, List, Any, Optional

# アプリケーションの初期化
app = Flask(__name__)

# 設定
app.config["DEBUG"] = True  # 開発環境用、本番環境では False に設定
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-key-change-this")

# ルート
@app.route("/")
def index():
    """
    トップページ
    """
    return render_template("index.html", title="${appName}")

# APIエンドポイント例
@app.route("/api/data", methods=["GET"])
def get_data():
    """
    データを取得するAPIエンドポイント
    """
    data = {
        "message": "Success",
        "data": [
            {"id": 1, "name": "Item 1"},
            {"id": 2, "name": "Item 2"}
        ]
    }
    return jsonify(data)

@app.route("/api/data", methods=["POST"])
def create_data():
    """
    データを作成するAPIエンドポイント
    """
    try:
        data = request.get_json()
        # TODO: データの検証と保存処理
        
        return jsonify({
            "message": "Data created successfully",
            "data": data
        }), 201
    except Exception as e:
        return jsonify({
            "message": "Error creating data",
            "error": str(e)
        }), 400

# エラーハンドラー
@app.errorhandler(404)
def not_found(e):
    """
    404エラーハンドラー
    """
    return jsonify({
        "message": "Resource not found",
        "error": str(e)
    }), 404

@app.errorhandler(500)
def server_error(e):
    """
    500エラーハンドラー
    """
    return jsonify({
        "message": "Internal server error",
        "error": str(e)
    }), 500

# メインエントリポイント
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
`;

  return code;
}

/**
 * Django アプリケーションテンプレートを生成
 */
export function generateDjangoViewTemplate(params: PythonTemplateParams): string {
  const appName = params.moduleName || 'myapp';
  
  let code = `#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
${params.description || `${appName} - Django Views`}

Author: ${params.author || 'ERIAS AI'}
Date: ${params.date || new Date().toISOString().split('T')[0]}
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponse
from django.views import View
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy

# モデルのインポート
# from .models import MyModel

# フォームのインポート
# from .forms import MyForm

# 関数ベースビューの例
def index(request):
    """
    インデックスページ
    """
    context = {
        'title': '${appName} App',
        'message': 'Welcome to ${appName}'
    }
    return render(request, '${appName}/index.html', context)

# クラスベースビューの例
class HomeView(View):
    """
    ホームページビュー
    """
    template_name = '${appName}/home.html'
    
    def get(self, request, *args, **kwargs):
        """
        GETリクエスト処理
        """
        context = {
            'title': 'Home',
            'message': 'Welcome to the home page'
        }
        return render(request, self.template_name, context)

# リストビューの例
# class ItemListView(ListView):
#     """
#     アイテム一覧ビュー
#     """
#     model = MyModel
#     template_name = '${appName}/item_list.html'
#     context_object_name = 'items'
#     paginate_by = 10
#     
#     def get_queryset(self):
#         """クエリセットをカスタマイズ"""
#         return MyModel.objects.all().order_by('-created_at')

# APIビューの例
def api_data(request):
    """
    APIデータエンドポイント
    """
    if request.method == 'GET':
        # GETリクエスト処理
        data = {
            'message': 'Success',
            'data': [
                {'id': 1, 'name': 'Item 1'},
                {'id': 2, 'name': 'Item 2'}
            ]
        }
        return JsonResponse(data)
    
    elif request.method == 'POST':
        # POSTリクエスト処理
        try:
            # リクエストデータの取得
            data = request.POST.copy()
            # またはJSONの場合
            # import json
            # data = json.loads(request.body)
            
            # TODO: データの検証と保存処理
            
            return JsonResponse({
                'message': 'Data created successfully',
                'data': data
            }, status=201)
        except Exception as e:
            return JsonResponse({
                'message': 'Error creating data',
                'error': str(e)
            }, status=400)
    
    # サポートされていないメソッド
    return JsonResponse({
        'message': 'Method not allowed'
    }, status=405)
`;

  return code;
}

/**
 * ファイルタイプに応じたPythonテンプレート生成を行う
 */
export function generatePythonTemplateByType(
  type: 'class' | 'function' | 'test' | 'flask' | 'django',
  params: PythonTemplateParams
): string {
  switch (type) {
    case 'class':
      return generatePythonClassTemplate(params);
    case 'function':
      return generatePythonFunctionTemplate(params);
    case 'test':
      return generatePythonTestTemplate(params);
    case 'flask':
      return generateFlaskAppTemplate(params);
    case 'django':
      return generateDjangoViewTemplate(params);
    default:
      return `# Unknown template type: ${type}`;
  }
}
