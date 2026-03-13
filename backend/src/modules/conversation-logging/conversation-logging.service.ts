import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AnalyticsEvent, EventBus } from '../../analytics/event-bus';
import { InMemoryAnalyticsStore } from '../../analytics/in-memory-analytics-store';
import { WorkflowModuleError } from '../../common/errors/workflow-module.error';
import { ExecutionContext } from '../../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput, ValidationError } from '../../common/interfaces/module.types';
import { WorkflowModule } from '../../common/interfaces/workflow-module.interface';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { CallSession, TranscriptEntry } from '../../common/models/call-session.model';
import { Objection } from '../../common/models/funnel.model';
import { AssessmentResult } from '../phase2.types';

export interface ConversationLoggingInput extends ModuleInput {
  leadId: string;
  customerId: string;
  funnelId: string;
  stageId: string;
  callSessionId: string;
  providerCallId: string;
  transcript: TranscriptEntry[];
  assessmentResult?: AssessmentResult;
  detectedObjections: Objection[];
  endReason: string;
  exceptionAction?: string;
  moduleOutputs: Record<string, Record<string, unknown>>;
}

export interface ConversationLoggingOutput extends ModuleOutput {
  logId: string;
  eventsEmitted: number;
}

@Injectable()
export class ConversationLoggingService
  implements WorkflowModule<ConversationLoggingInput, ConversationLoggingOutput>
{
  readonly id = 'conversation-logging';
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(
    private readonly analyticsStore: InMemoryAnalyticsStore,
    private readonly eventBus: EventBus,
    private readonly loggerFactory: AppLoggerService,
  ) {
    this.logger = this.loggerFactory.createLogger(this.id);
  }

  async execute(input: ConversationLoggingInput, _context: ExecutionContext): Promise<ConversationLoggingOutput> {
    const validationErrors = this.validateInputs(input);
    if (validationErrors.length > 0) {
      throw new WorkflowModuleError(validationErrors[0].message, this.id);
    }

    const logId = `log_${randomUUID()}`;
    const outcome = this.resolveOutcome(input);
    const callSession: CallSession = {
      id: input.callSessionId,
      leadId: input.leadId,
      customerId: input.customerId,
      funnelId: input.funnelId,
      stageId: input.stageId,
      startedAt: input.transcript[0]?.timestamp,
      endedAt: input.transcript[input.transcript.length - 1]?.timestamp,
      status: 'completed',
      durationSeconds: this.computeDurationSeconds(input.transcript),
      transcript: input.transcript,
      moduleOutputs: input.moduleOutputs,
      assessmentScore: input.assessmentResult?.score,
      outcome,
    };

    this.analyticsStore.saveCallSession(callSession);

    const events = this.buildEvents(logId, input, outcome);
    for (const event of events) {
      this.eventBus.emit(event);
    }

    this.logger.info('Conversation logged', {
      logId,
      callSessionId: input.callSessionId,
      eventsEmitted: events.length,
      outcome,
    });

    return {
      logId,
      eventsEmitted: events.length,
    };
  }

  validateInputs(input: ConversationLoggingInput): ValidationError[] {
    const errors: ValidationError[] = [];
    for (const field of ['leadId', 'customerId', 'funnelId', 'stageId', 'callSessionId', 'providerCallId']) {
      if (typeof input[field] !== 'string' || (input[field] as string).trim().length === 0) {
        errors.push({ field, message: `${field} is required` });
      }
    }
    if (!Array.isArray(input.transcript)) {
      errors.push({ field: 'transcript', message: 'transcript must be an array' });
    }
    if (!Array.isArray(input.detectedObjections)) {
      errors.push({ field: 'detectedObjections', message: 'detectedObjections must be an array' });
    }
    if (typeof input.moduleOutputs !== 'object' || input.moduleOutputs === null || Array.isArray(input.moduleOutputs)) {
      errors.push({ field: 'moduleOutputs', message: 'moduleOutputs must be an object' });
    }
    return errors;
  }

  getDependencies(): string[] {
    return ['conversation-loop', 'exception-handling'];
  }

  isFusable(_adjacentModuleId: string): boolean {
    return true;
  }

  canSkip(_context: ExecutionContext): boolean {
    return false;
  }

  private resolveOutcome(input: ConversationLoggingInput): 'recovered' | 'failed' | 'escalated' {
    if (input.exceptionAction === 'escalate' || input.endReason === 'escalation-triggered') {
      return 'escalated';
    }
    if (input.endReason === 'goal-achieved' || input.assessmentResult?.recommendation === 'close-recovered') {
      return 'recovered';
    }
    return 'failed';
  }

  private buildEvents(
    logId: string,
    input: ConversationLoggingInput,
    outcome: 'recovered' | 'failed' | 'escalated',
  ): AnalyticsEvent[] {
    const events: AnalyticsEvent[] = [
      {
        type: 'call.completed',
        payload: {
          logId,
          leadId: input.leadId,
          callSessionId: input.callSessionId,
          providerCallId: input.providerCallId,
          endReason: input.endReason,
          outcome,
        },
      },
    ];

    if (input.endReason === 'goal-achieved') {
      events.push({
        type: 'goal.achieved',
        payload: {
          logId,
          leadId: input.leadId,
          callSessionId: input.callSessionId,
        },
      });
    }

    if (outcome === 'recovered') {
      events.push({
        type: 'lead.recovered',
        payload: {
          logId,
          leadId: input.leadId,
          score: input.assessmentResult?.score,
        },
      });
    }

    if (outcome === 'escalated') {
      events.push({
        type: 'lead.escalated',
        payload: {
          logId,
          leadId: input.leadId,
          reason: input.endReason,
        },
      });
    }

    for (const objection of input.detectedObjections) {
      events.push({
        type: 'objection.new',
        payload: {
          logId,
          leadId: input.leadId,
          objectionId: objection.id,
          title: objection.title,
        },
      });
    }

    return events;
  }

  private computeDurationSeconds(transcript: TranscriptEntry[]): number | undefined {
    if (transcript.length < 2) {
      return undefined;
    }

    const startedAt = transcript[0]?.timestamp?.getTime();
    const endedAt = transcript[transcript.length - 1]?.timestamp?.getTime();
    if (typeof startedAt !== 'number' || typeof endedAt !== 'number') {
      return undefined;
    }

    return Math.max(0, Math.round((endedAt - startedAt) / 1000));
  }
}