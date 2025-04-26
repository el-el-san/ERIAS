import { FileInfo, ProjectTask, Coder as CoderInterface, UserFeedback } from './types.js';
import { GeminiClient } from '../llm/geminiClient.js';
import { PromptBuilder } from '../llm/promptBuilder.js';
import {
  generateFile,
  regenerateFile,
  adjustFileWithFeedback,
  addFeatureFromFeedback,
  generateReadme
} from '../coder/generation.js';
import { installDependencies } from '../coder/dependency.js';
import {
  setupCodingTools,
  gatherRelatedCode,
  getCodingStandards,
  extractCodeFromResponse
} from '../coder/utils.js';

export class Coder implements CoderInterface {
  private geminiClient: GeminiClient;
  private promptBuilder: PromptBuilder;

  constructor(geminiClient: GeminiClient, promptBuilder: PromptBuilder) {
    this.geminiClient = geminiClient;
    this.promptBuilder = promptBuilder;
  }

  public async generateFile(task: ProjectTask, fileInfo: FileInfo): Promise<string> {
    return generateFile(
      this.geminiClient,
      this.promptBuilder,
      task,
      fileInfo,
      getCodingStandards,
      gatherRelatedCode,
      setupCodingTools,
      extractCodeFromResponse
    );
  }

  public async regenerateFile(task: ProjectTask, fileInfo: FileInfo, existingContent: string): Promise<string> {
    return regenerateFile(
      this.geminiClient,
      this.promptBuilder,
      task,
      fileInfo,
      existingContent,
      gatherRelatedCode,
      setupCodingTools,
      extractCodeFromResponse
    );
  }

  public async adjustFileWithFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean> {
    return adjustFileWithFeedback(
      this.geminiClient,
      this.promptBuilder,
      task,
      feedback,
      setupCodingTools,
      extractCodeFromResponse
    );
  }

  public async addFeatureFromFeedback(task: ProjectTask, feedback: UserFeedback): Promise<boolean> {
    return addFeatureFromFeedback(
      this.geminiClient,
      this.promptBuilder,
      task,
      feedback,
      setupCodingTools
    );
  }

  public async generateReadme(task: ProjectTask): Promise<void> {
    return generateReadme(
      this.geminiClient,
      this.promptBuilder,
      task,
      setupCodingTools
    );
  }

  public async installDependencies(task: ProjectTask): Promise<boolean> {
    return installDependencies(
      task,
      setupCodingTools
    );
  }
}