import path from 'path';
import fs from 'fs/promises';
import { ProjectTask } from '../agent/types.js';
import logger from '../utils/logger.js';
import { getProjectPath } from '../tools/fileSystem.js';
import { commandTools } from '../tools/commandExecutor.js';
import { toolRegistry } from '../llm/toolRegistry.js';

/**
 * 依存関係インストール系ユーティリティ
 */
export async function installDependencies(
  task: ProjectTask,
  setupCodingTools: (task: ProjectTask) => void
): Promise<boolean> {
  logger.info(`Installing dependencies for project: ${task.id}`);

  if (!task.plan?.dependencies) {
    logger.warn('No dependencies defined in plan');
    return false;
  }

  try {
    setupCodingTools(task);

    const projectPath = getProjectPath(task.id);

    // package.jsonが存在するか確認
    const packageJsonPath = path.join(projectPath, 'package.json');
    let packageJsonExists = false;

    try {
      await fs.access(packageJsonPath);
      packageJsonExists = true;
    } catch {
      packageJsonExists = false;
    }

    if (!packageJsonExists) {
      logger.debug('Creating package.json');
      const projectName = path.basename(projectPath).replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

      const packageJson = {
        name: projectName,
        version: '0.1.0',
        description: task.plan?.projectDescription || 'Generated project',
        main: 'index.js',
        scripts: {
          test: 'echo "No tests specified" && exit 0'
        },
        keywords: [],
        author: '',
        license: 'ISC',
        dependencies: {},
        devDependencies: {}
      };

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
    }

    // 本番用依存関係をインストール
    if (task.plan.dependencies.production.length > 0) {
      logger.debug(`Installing production dependencies: ${task.plan.dependencies.production.join(', ')}`);
      const npmInstallTool = commandTools.find(tool => tool.name === 'npmInstall');

      if (npmInstallTool) {
        const result = await npmInstallTool.function(
          getProjectPath(task.id),
          task.plan.dependencies.production.join(' ')
        );

        if (!result) {
          logger.error(`Failed to install production dependencies`);
          return false;
        }
      }
    }

    // 開発用依存関係をインストール
    if (task.plan.dependencies.development.length > 0) {
      logger.debug(`Installing development dependencies: ${task.plan.dependencies.development.join(', ')}`);
      const npmInstallTool = commandTools.find(tool => tool.name === 'npmInstall');

      if (npmInstallTool) {
        const result = await npmInstallTool.function(
          getProjectPath(task.id),
          task.plan.dependencies.development.join(' ')
        );

        if (!result) {
          logger.error(`Failed to install development dependencies`);
          return false;
        }
      }
    }

    logger.info('Successfully installed all dependencies');
    return true;
  } catch (error) {
    logger.error(`Error installing dependencies: ${(error as Error).message}`);
    return false;
  } finally {
    toolRegistry.clearTools();
  }
}