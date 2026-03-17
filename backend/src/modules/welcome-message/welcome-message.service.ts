import { Inject, Injectable } from '@nestjs/common';
import { CallEventStoreService } from '../../analytics/call-event-store.service';
import { LocalAudioCache } from '../../adapters/audio-cache/local-audio-cache';
import { TELEPHONY_ADAPTER, TTS_ADAPTER } from '../../adapters/integration.tokens';
import { TelephonyAdapter } from '../../adapters/telephony/telephony-adapter.interface';
import { TTSAdapter } from '../../adapters/tts/tts-adapter.interface';
import { WorkflowModuleError } from '../../common/errors/workflow-module.error';
import { ExecutionContext } from '../../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput, ValidationError } from '../../common/interfaces/module.types';
import { WorkflowModule } from '../../common/interfaces/workflow-module.interface';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { Customer } from '../../common/models/customer.model';
import { FunnelContext } from '../../common/models/funnel.model';
import { AgentPersona } from '../phase2.types';

export interface WelcomeMessageInput extends ModuleInput {
  providerCallId: string;
  customer: Customer;
  funnelContext: FunnelContext;
  agentPersona: AgentPersona;
}

export interface WelcomeMessageOutput extends ModuleOutput {
  welcomeAudioRef: string;
  deliveredAt: Date;
  welcomeText: string;
}

@Injectable()
export class WelcomeMessageService implements WorkflowModule<WelcomeMessageInput, WelcomeMessageOutput> {
  readonly id = 'welcome-message';
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(
    @Inject(TTS_ADAPTER)
    private readonly ttsAdapter: TTSAdapter,
    @Inject(TELEPHONY_ADAPTER)
    private readonly telephonyAdapter: TelephonyAdapter,
    private readonly audioCache: LocalAudioCache,
    private readonly loggerFactory: AppLoggerService,
    private readonly callEventStore: CallEventStoreService,
  ) {
    this.logger = this.loggerFactory.createLogger(this.id);
  }

  async execute(input: WelcomeMessageInput, _context: ExecutionContext): Promise<WelcomeMessageOutput> {
    const validationErrors = this.validateInputs(input);
    if (validationErrors.length > 0) {
      throw new WorkflowModuleError(validationErrors[0].message, this.id);
    }

    const firstName = input.customer.name.split(' ')[0] ?? input.customer.name;
    const welcomeText =
      `Hi ${firstName}, this is ${input.agentPersona.name}. ` +
      'I noticed your application was paused and I can help you complete it now. ' +
      'Do you have a couple of minutes?';

    let welcomeAudioRef = 'text-only://welcome-message';

    try {
      const synthesized = await this.ttsAdapter.synthesize({
        text: welcomeText,
        voiceId: input.agentPersona.voiceId,
        language: input.agentPersona.language,
      });

      const cachedAudio = await this.audioCache.get(synthesized.cacheKey);
      if (!cachedAudio) {
        await this.audioCache.put(synthesized.cacheKey, {
          buffer: synthesized.audioBuffer,
          durationSeconds: synthesized.durationSeconds,
          reference: `audio://${synthesized.cacheKey}`,
        });
      }

      await this.telephonyAdapter.streamAudio(input.providerCallId, synthesized.audioBuffer);
      welcomeAudioRef = `audio://${synthesized.cacheKey}`;
    } catch (error) {
      this.logger.warn('Falling back to text-only welcome message', {
        providerCallId: input.providerCallId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }

    const output: WelcomeMessageOutput = {
      welcomeAudioRef,
      deliveredAt: new Date(),
      welcomeText,
    };

    this.logger.info('Welcome message delivered', {
      providerCallId: input.providerCallId,
      welcomeAudioRef: output.welcomeAudioRef,
      stageId: input.funnelContext.currentStageId,
    });
    this.callEventStore.recordEvent({
      eventName: 'welcome.message',
      category: 'workflow',
      direction: 'internal',
      phase: 'delivered',
      callSessionId: undefined,
      providerCallId: input.providerCallId,
      occurredAt: output.deliveredAt.toISOString(),
      payload: {
        stageId: input.funnelContext.currentStageId,
        welcomeAudioRef: output.welcomeAudioRef,
      },
    });

    return output;
  }

  validateInputs(input: WelcomeMessageInput): ValidationError[] {
    const errors: ValidationError[] = [];
    if (typeof input.providerCallId !== 'string' || input.providerCallId.trim().length === 0) {
      errors.push({ field: 'providerCallId', message: 'providerCallId is required' });
    }
    if (!input.customer || typeof input.customer.name !== 'string') {
      errors.push({ field: 'customer', message: 'customer is required' });
    }
    if (!input.agentPersona || typeof input.agentPersona.name !== 'string') {
      errors.push({ field: 'agentPersona', message: 'agentPersona is required' });
    }
    return errors;
  }

  getDependencies(): string[] {
    return ['call-initiation'];
  }

  isFusable(adjacentModuleId: string): boolean {
    return adjacentModuleId === 'call-initiation';
  }

  canSkip(_context: ExecutionContext): boolean {
    return false;
  }
}
