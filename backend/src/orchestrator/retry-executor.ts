import { Injectable } from '@nestjs/common';
import { WorkflowExecutionError } from './orchestrator.errors';

interface RetryOptions {
  attempts: number;
  delayMs: number;
  timeoutMs: number;
  stepId: string;
}

@Injectable()
export class RetryExecutor {
  async execute<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
      try {
        return await this.withTimeout(operation(), options.timeoutMs, options.stepId);
      } catch (error) {
        lastError = error;
        if (attempt >= options.attempts) {
          break;
        }

        if (options.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }
      }
    }

    throw new WorkflowExecutionError(
      lastError instanceof Error ? lastError.message : 'Workflow step execution failed',
      options.stepId,
    );
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, stepId: string): Promise<T> {
    if (timeoutMs <= 0) {
      return promise;
    }

    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new WorkflowExecutionError(`Step timed out: ${stepId}`, stepId)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}