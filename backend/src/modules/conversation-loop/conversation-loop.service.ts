import { Injectable } from '@nestjs/common';
import { WorkflowModuleError } from '../../common/errors/workflow-module.error';
import { ExecutionContext } from '../../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput, ValidationError } from '../../common/interfaces/module.types';
import { WorkflowModule } from '../../common/interfaces/workflow-module.interface';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TranscriptEntry } from '../../common/models/call-session.model';
import { Objection } from '../../common/models/funnel.model';
import { AssessmentService } from '../../services/assessment.service';
import { AssessmentResult, ConversationEndReason, ConversationStrategy } from '../phase2.types';
import { ResponseProcessingService } from '../response-processing/response-processing.service';

export interface ConversationLoopInput extends ModuleInput {
  providerCallId: string;
  callSessionId: string;
  conversationStrategy: ConversationStrategy;
  initialTranscript?: TranscriptEntry[];
  initialAgentText?: string;
  initialAgentAudioRef?: string;
  initialAgentTimestamp?: Date;
  scriptedCustomerUtterances?: string[];
}

export interface ConversationLoopOutput extends ModuleOutput {
  finalTranscript: TranscriptEntry[];
  endReason: ConversationEndReason;
  turnCount: number;
  detectedObjections: Objection[];
  assessment: AssessmentResult;
  intentHistory: string[];
  turnsSinceGoalProgress: number;
}

@Injectable()
export class ConversationLoopService
  implements WorkflowModule<ConversationLoopInput, ConversationLoopOutput>
{
  readonly id = 'conversation-loop';
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(
    private readonly responseProcessingService: ResponseProcessingService,
    private readonly assessmentService: AssessmentService,
    private readonly loggerFactory: AppLoggerService,
  ) {
    this.logger = this.loggerFactory.createLogger(this.id);
  }

  async execute(input: ConversationLoopInput, context: ExecutionContext): Promise<ConversationLoopOutput> {
    const validationErrors = this.validateInputs(input);
    if (validationErrors.length > 0) {
      throw new WorkflowModuleError(validationErrors[0].message, this.id);
    }

    const transcript = this.buildInitialTranscript(input);
    const detectedObjections: Objection[] = [];
    const intentHistory: string[] = [];
    const utterances = input.scriptedCustomerUtterances ?? [
      'I did not receive otp',
      'yes, please continue',
    ];

    let endReason: ConversationEndReason = 'max-turns-reached';
    let turnCount = 0;
    let mandatoryGoalsAchieved = 0;
    let turnsSinceGoalProgress = 0;
    const mandatoryGoals = input.conversationStrategy.goals.filter((goal) => goal.isMandatory).length;

    for (const utterance of utterances) {
      if (turnCount >= input.conversationStrategy.maxTurns) {
        endReason = 'max-turns-reached';
        break;
      }

      const output = await this.responseProcessingService.execute(
        {
          providerCallId: input.providerCallId,
          audioBuffer: Buffer.from(`AUDIO:${utterance}`, 'utf8'),
          conversationHistory: transcript,
          conversationStrategy: input.conversationStrategy,
        },
        context,
      );

      const timestamp = new Date();
      transcript.push({ timestamp, speaker: 'customer', text: output.customerText });
      transcript.push({ timestamp: new Date(), speaker: 'agent', text: output.agentText, audioRef: output.agentAudioRef });

      turnCount += 1;
      intentHistory.push(output.intentLabel);
      turnsSinceGoalProgress += 1;

      if (output.detectedObjection) {
        detectedObjections.push(output.detectedObjection);
      }

      if (output.intentLabel === 'hard-rejection') {
        endReason = 'customer-declined';
        break;
      }

      if (output.intentLabel === 'stt-empty') {
        endReason = 'escalation-triggered';
        break;
      }

      if (/\b(bye|hang up|later)\b/i.test(output.customerText)) {
        endReason = 'customer-hung-up';
        break;
      }

      if (output.intentLabel === 'consent') {
        mandatoryGoalsAchieved = mandatoryGoals;
        turnsSinceGoalProgress = 0;
        endReason = 'goal-achieved';
        break;
      }
    }

    const assessment = this.assessmentService.evaluate({
      mandatoryGoals,
      achievedGoals: mandatoryGoalsAchieved,
      endReason,
      turnCount,
      maxTurns: input.conversationStrategy.maxTurns,
      objectionCount: detectedObjections.length,
    });

    this.logger.info('Conversation loop completed', {
      callSessionId: input.callSessionId,
      turnCount,
      endReason,
      score: assessment.score,
    });

    return {
      finalTranscript: transcript,
      endReason,
      turnCount,
      detectedObjections,
      assessment,
      intentHistory,
      turnsSinceGoalProgress,
    };
  }

  validateInputs(input: ConversationLoopInput): ValidationError[] {
    const errors: ValidationError[] = [];
    if (typeof input.providerCallId !== 'string' || input.providerCallId.trim().length === 0) {
      errors.push({ field: 'providerCallId', message: 'providerCallId is required' });
    }
    if (typeof input.callSessionId !== 'string' || input.callSessionId.trim().length === 0) {
      errors.push({ field: 'callSessionId', message: 'callSessionId is required' });
    }
    if (!input.conversationStrategy || typeof input.conversationStrategy.maxTurns !== 'number') {
      errors.push({ field: 'conversationStrategy', message: 'conversationStrategy is required' });
    }
    if (!Array.isArray(input.initialTranscript) && typeof input.initialAgentText !== 'string') {
      errors.push({ field: 'initialTranscript', message: 'initialTranscript or initialAgentText is required' });
    }
    return errors;
  }

  getDependencies(): string[] {
    return ['response-processing'];
  }

  isFusable(adjacentModuleId: string): boolean {
    return adjacentModuleId === 'response-processing';
  }

  canSkip(_context: ExecutionContext): boolean {
    return false;
  }

  private buildInitialTranscript(input: ConversationLoopInput): TranscriptEntry[] {
    if (Array.isArray(input.initialTranscript)) {
      return [...input.initialTranscript];
    }

    return [
      {
        timestamp: input.initialAgentTimestamp ?? new Date(),
        speaker: 'agent',
        text: input.initialAgentText ?? '',
        audioRef: input.initialAgentAudioRef,
      },
    ];
  }
}
