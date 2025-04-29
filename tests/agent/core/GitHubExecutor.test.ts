import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GitHubExecutor } from '../../../src/agent/core/GitHubExecutor';
import { TaskManager } from '../../../src/agent/core/TaskManager';
import { Coder } from '../../../src/agent/coder';
import { Tester } from '../../../src/agent/tester';
import { GitHubService } from '../../../src/services/githubService';
import { NotificationService } from '../../../src/agent/services/notificationService';
import { NotificationTarget } from '../../../src/platforms/types';
import { ProjectStatus } from '../../../src/agent/types';

// モック
jest.mock('../../../src/agent/core/TaskManager');
jest.mock('../../../src/agent/coder');
jest.mock('../../../src/agent/tester');
jest.mock('../../../src/services/githubService');
jest.mock('../../../src/agent/services/notificationService');
jest.mock('../../../src/tools/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

describe('GitHubExecutor', () => {
  let githubExecutor: GitHubExecutor;
  let taskManager: jest.Mocked<TaskManager>;
  let coder: jest.Mocked<Coder>;
  let tester: jest.Mocked<Tester>;
  let githubService: jest.Mocked<GitHubService>;
  let notificationService: jest.Mocked<NotificationService>;
  
  const mockTaskId = 'test-task-123';
  const mockRepoUrl = 'https://github.com/test-owner/test-repo';
  const mockTaskDescription = 'Add new feature';
  const mockTarget: NotificationTarget = {
    platform: 'discord',
    channelId: 'test-channel',
    userId: 'test-user'
  };
  
  beforeEach(() => {
    // モッククラスの設定
    taskManager = new TaskManager() as jest.Mocked<TaskManager>;
    coder = new Coder() as jest.Mocked<Coder>;
    tester = new Tester() as jest.Mocked<Tester>;
    
    // NotificationServiceのシングルトンモック
    notificationService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
      getInstance: jest.fn().mockReturnThis()
    } as unknown as jest.Mocked<NotificationService>;
    (NotificationService as jest.Mock).getInstance = jest.fn().mockReturnValue(notificationService);
    
    // GitHubServiceのモック生成とメソッドのモック化
    githubService = {
      parseRepoUrl: jest.fn().mockReturnValue({ owner: 'test-owner', repo: 'test-repo' }),
      cloneRepository: jest.fn().mockResolvedValue(true),
      getDefaultBranch: jest.fn().mockResolvedValue('main'),
      syncBranch: jest.fn().mockResolvedValue(true),
      createBranch: jest.fn().mockResolvedValue(true),
      listRepositoryFiles: jest.fn().mockResolvedValue(['file1.js', 'file2.js']),
      generateGitHubPrompt: jest.fn().mockReturnValue('test prompt'),
      commitChanges: jest.fn().mockResolvedValue(true),
      pushChanges: jest.fn().mockResolvedValue(true),
      createPullRequest: jest.fn().mockResolvedValue('https://github.com/test-owner/test-repo/pull/1')
    } as unknown as jest.Mocked<GitHubService>;
    
    // テスト結果のモック
    tester.runTests = jest.fn().mockResolvedValue({ success: true, output: 'All tests passed' });
    
    // GitHubExecutorの初期化（依存性注入）
    githubExecutor = new GitHubExecutor(taskManager, coder, tester);
    // GitHubServiceを内部で生成しているので、プロトタイプを上書き
    (githubExecutor as any).githubService = githubService;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('executeGitHubTask', () => {
    it('正常に実行されるとタスクが完了する', async () => {
      // タスク進捗更新のモック
      taskManager.updateTaskProgress = jest.fn().mockResolvedValue(undefined);
      taskManager.setTaskCompleted = jest.fn().mockResolvedValue(undefined);
      
      // コーダーのモック
      coder.addFeatureFromFeedback = jest.fn().mockResolvedValue(undefined);
      
      // 実行
      await githubExecutor.executeGitHubTask(mockTaskId, mockRepoUrl, mockTaskDescription, mockTarget);
      
      // 検証
      expect(githubService.parseRepoUrl).toHaveBeenCalledWith(mockRepoUrl);
      expect(githubService.cloneRepository).toHaveBeenCalled();
      expect(githubService.createBranch).toHaveBeenCalled();
      expect(coder.addFeatureFromFeedback).toHaveBeenCalled();
      expect(tester.runTests).toHaveBeenCalled();
      expect(githubService.commitChanges).toHaveBeenCalled();
      expect(githubService.pushChanges).toHaveBeenCalled();
      expect(githubService.createPullRequest).toHaveBeenCalled();
      expect(taskManager.setTaskCompleted).toHaveBeenCalledWith(mockTaskId, 'GitHub連携タスクが完了しました');
      expect(notificationService.sendNotification).toHaveBeenCalled();
    });
    
    it('リポジトリのクローンに失敗するとタスクが失敗する', async () => {
      // クローン失敗のモック
      githubService.cloneRepository = jest.fn().mockResolvedValue(false);
      
      // タスク失敗のモック
      taskManager.setTaskFailed = jest.fn().mockResolvedValue(undefined);
      
      // 実行
      await githubExecutor.executeGitHubTask(mockTaskId, mockRepoUrl, mockTaskDescription, mockTarget);
      
      // 検証
      expect(githubService.cloneRepository).toHaveBeenCalled();
      expect(taskManager.setTaskFailed).toHaveBeenCalled();
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        mockTarget,
        expect.objectContaining({
          text: expect.stringContaining('エラーが発生しました')
        })
      );
    });
    
    it('テストに失敗してもプルリクエストが作成される', async () => {
      // テスト失敗のモック
      tester.runTests = jest.fn().mockResolvedValue({ success: false, output: 'Tests failed' });
      
      // タスク進捗更新のモック
      taskManager.updateTaskProgress = jest.fn().mockResolvedValue(undefined);
      taskManager.setTaskCompleted = jest.fn().mockResolvedValue(undefined);
      
      // コーダーのモック
      coder.addFeatureFromFeedback = jest.fn().mockResolvedValue(undefined);
      
      // 実行
      await githubExecutor.executeGitHubTask(mockTaskId, mockRepoUrl, mockTaskDescription, mockTarget);
      
      // 検証
      expect(tester.runTests).toHaveBeenCalled();
      expect(githubService.commitChanges).toHaveBeenCalled();
      expect(githubService.pushChanges).toHaveBeenCalled();
      expect(githubService.createPullRequest).toHaveBeenCalled();
      expect(taskManager.setTaskCompleted).toHaveBeenCalled();
      
      // 通知にテスト失敗の情報が含まれていること
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        mockTarget,
        expect.objectContaining({
          text: expect.stringContaining('テストに一部失敗しました')
        })
      );
    });
    
    it('プルリクエスト作成に失敗するとタスクが失敗する', async () => {
      // PR作成の失敗モック
      githubService.createPullRequest = jest.fn().mockRejectedValue(new Error('PR creation failed'));
      
      // タスク進捗更新のモック
      taskManager.updateTaskProgress = jest.fn().mockResolvedValue(undefined);
      taskManager.setTaskFailed = jest.fn().mockResolvedValue(undefined);
      
      // コーダーのモック
      coder.addFeatureFromFeedback = jest.fn().mockResolvedValue(undefined);
      
      // 実行
      await githubExecutor.executeGitHubTask(mockTaskId, mockRepoUrl, mockTaskDescription, mockTarget);
      
      // 検証
      expect(githubService.createPullRequest).toHaveBeenCalled();
      expect(taskManager.setTaskFailed).toHaveBeenCalled();
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        mockTarget,
        expect.objectContaining({
          text: expect.stringContaining('プルリクエストの作成に失敗しました')
        })
      );
    });
    
    it('ブランチの作成に失敗するとタスクが失敗する', async () => {
      // ブランチ作成失敗のモック
      githubService.createBranch = jest.fn().mockResolvedValue(false);
      
      // タスク失敗のモック
      taskManager.setTaskFailed = jest.fn().mockResolvedValue(undefined);
      
      // 実行
      await githubExecutor.executeGitHubTask(mockTaskId, mockRepoUrl, mockTaskDescription, mockTarget);
      
      // 検証
      expect(githubService.createBranch).toHaveBeenCalled();
      expect(taskManager.setTaskFailed).toHaveBeenCalled();
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        mockTarget,
        expect.objectContaining({
          text: expect.stringContaining('エラーが発生しました')
        })
      );
    });
    
    it('変更のプッシュに失敗するとタスクが失敗する', async () => {
      // プッシュ失敗のモック
      githubService.pushChanges = jest.fn().mockResolvedValue(false);
      
      // タスク進捗更新のモック
      taskManager.updateTaskProgress = jest.fn().mockResolvedValue(undefined);
      taskManager.setTaskFailed = jest.fn().mockResolvedValue(undefined);
      
      // コーダーのモック
      coder.addFeatureFromFeedback = jest.fn().mockResolvedValue(undefined);
      
      // 実行
      await githubExecutor.executeGitHubTask(mockTaskId, mockRepoUrl, mockTaskDescription, mockTarget);
      
      // 検証
      expect(githubService.pushChanges).toHaveBeenCalled();
      expect(taskManager.setTaskFailed).toHaveBeenCalled();
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        mockTarget,
        expect.objectContaining({
          text: expect.stringContaining('エラーが発生しました')
        })
      );
    });
  });
});
