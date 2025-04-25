#!/usr/bin/env node

import { AgentCore } from './agent/agentCore.js';
import { DiscordBot } from './bot/discordBot.js';
import { Planner } from './agent/planner.js';
import { Coder } from './agent/coder.js';
import { Tester } from './agent/tester.js';
import { Debugger } from './agent/debugger.js';
import { GeminiClient } from './llm/geminiClient.js';
import { PromptBuilder } from './llm/promptBuilder.js';
import logger from './utils/logger.js';
import config from './config/config.js';

/**
 * メインアプリケーション
 * 初期化と起動処理を行う
 */
async function main() {
  try {
    logger.info('Discord AI Agent is starting...');
    
    // 共通コンポーネントを初期化
    const geminiClient = new GeminiClient();
    const promptBuilder = new PromptBuilder();
    
    // 各モジュールのインスタンスを作成
    const planner = new Planner(geminiClient, promptBuilder);
    const coder = new Coder(geminiClient, promptBuilder);
    const tester = new Tester();
    const debugger_ = new Debugger(geminiClient, promptBuilder);
    
    // AgentCoreを初期化
    const agentCore = new AgentCore(planner, coder, tester, debugger_);
    
    // Discordボットを初期化
    const discordBot = new DiscordBot(agentCore);
    
    // ボットを起動
    await discordBot.start();
    
    logger.info(`Discord AI Agent is running (version ${config.version})`);
    
    // シャットダウンハンドラーを設定
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal. Shutting down...');
      await discordBot.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal. Shutting down...');
      await discordBot.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error(`Failed to start application: ${(error as Error).message}`);
    process.exit(1);
  }
}

// アプリケーションを起動
main();
