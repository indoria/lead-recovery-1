import { Inject, Injectable } from '@nestjs/common';
import { CRM_ADAPTER } from '../../adapters/crm/crm.tokens';
import { CRMAdapter } from '../../adapters/crm/crm-adapter.interface';
import { WorkflowModuleError } from '../../common/errors/workflow-module.error';
import { ExecutionContext } from '../../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput, ValidationError } from '../../common/interfaces/module.types';
import { WorkflowModule } from '../../common/interfaces/workflow-module.interface';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TranscriptEntry } from '../../common/models/call-session.model';
import { Objection } from '../../common/models/funnel.model';
import { ConversationStrategy } from '../phase2.types';

export type ExceptionAction = 'none' | 'steer' | 'redirect' | 'escalate';

export interface ExceptionHandlingInput extends ModuleInput {
  leadId: string;
  currentTranscript: TranscriptEntry[];
  conversationStrategy: ConversationStrategy;
  intentHistory: string[];
  detectedObjections: Objection[];
  turnsSinceGoalProgress: number;
}

export interface ExceptionHandlingOutput extends ModuleOutput {
  action: ExceptionAction;
  steeringPrompt?: string;
  escalationReason?: string;
}

@Injectable()
export class ExceptionHandlingService
  implements WorkflowModule<ExceptionHandlingInput, ExceptionHandlingOutput>
{
  readonly id = 'exception-handling';
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(
    @Inject(CRM_ADAPTER) private readonly crmAdapter: CRMAdapter,
    private readonly loggerFactory: AppLoggerService,
  ) {
    this.logger = this.loggerFactory.createLogger(this.id);
  }

  async execute(input: ExceptionHandlingInput, _context: ExecutionContext): Promise<ExceptionHandlingOutput> {
    const validationErrors = this.validateInputs(input);
    if (validationErrors.length > 0) {
      throw new WorkflowModuleError(validationErrors[0].message, this.id);
    }

    const repeatedObjection = this.findRepeatedObjection(input.detectedObjections);
    const trailingOffTopicTurns = this.countTrailingIntent(input.intentHistory, 'off-topic');
    const lastCustomerMessage = [...input.currentTranscript].reverse().find((entry) => entry.speaker === 'customer');

    if (lastCustomerMessage && /\b(human|person|agent|representative)\b/i.test(lastCustomerMessage.text)) {
      await this.crmAdapter.updateLeadStatus(input.leadId, 'escalated');
      return this.buildEscalation('customer requested a human agent');
    }

    if (repeatedObjection && repeatedObjection.count >= 3) {
      await this.crmAdapter.updateLeadStatus(input.leadId, 'escalated');
      return this.buildEscalation(`repeated objection detected: ${repeatedObjection.id}`);
    }

    if (trailingOffTopicTurns >= 2) {
      return {
        action: 'steer',
        steeringPrompt: 'Acknowledge the side topic briefly, then redirect the customer back to the application recovery goal.',
      };
    }

    if (input.turnsSinceGoalProgress >= Math.max(2, input.conversationStrategy.maxTurns - 2)) {
      return {
        action: 'redirect',
        steeringPrompt: 'Summarize the remaining step and ask a direct question that moves the customer toward the current recovery goal.',
      };
    }

    this.logger.info('Conversation remained on track', {
      leadId: input.leadId,
      turnsSinceGoalProgress: input.turnsSinceGoalProgress,
    });

    return { action: 'none' };
  }

  validateInputs(input: ExceptionHandlingInput): ValidationError[] {
    const errors: ValidationError[] = [];
    if (typeof input.leadId !== 'string' || input.leadId.trim().length === 0) {
      errors.push({ field: 'leadId', message: 'leadId is required' });
    }
    if (!Array.isArray(input.currentTranscript)) {
      errors.push({ field: 'currentTranscript', message: 'currentTranscript must be an array' });
    }
    if (!input.conversationStrategy || typeof input.conversationStrategy.maxTurns !== 'number') {
      errors.push({ field: 'conversationStrategy', message: 'conversationStrategy is required' });
    }
    if (!Array.isArray(input.intentHistory)) {
      errors.push({ field: 'intentHistory', message: 'intentHistory must be an array' });
    }
    if (!Array.isArray(input.detectedObjections)) {
      errors.push({ field: 'detectedObjections', message: 'detectedObjections must be an array' });
    }
    if (typeof input.turnsSinceGoalProgress !== 'number') {
      errors.push({ field: 'turnsSinceGoalProgress', message: 'turnsSinceGoalProgress is required' });
    }
    return errors;
  }

  getDependencies(): string[] {
    return ['conversation-loop'];
  }

  isFusable(_adjacentModuleId: string): boolean {
    return false;
  }

  canSkip(context: ExecutionContext): boolean {
    return context.config.llm.hasBuiltInDeviation;
  }

  private countTrailingIntent(intentHistory: string[], intentLabel: string): number {
    let count = 0;
    for (let index = intentHistory.length - 1; index >= 0; index -= 1) {
      if (intentHistory[index] !== intentLabel) {
        break;
      }
      count += 1;
    }
    return count;
  }

  private findRepeatedObjection(objections: Objection[]): { id: string; count: number } | undefined {
    const counts = new Map<string, number>();
    for (const objection of objections) {
      const nextCount = (counts.get(objection.id) ?? 0) + 1;
      counts.set(objection.id, nextCount);
      if (nextCount >= 3) {
        return { id: objection.id, count: nextCount };
      }
    }

    return undefined;
  }

  private buildEscalation(reason: string): ExceptionHandlingOutput {
    this.logger.warn('Conversation escalated', { reason });
    return {
      action: 'escalate',
      escalationReason: reason,
    };
  }
}