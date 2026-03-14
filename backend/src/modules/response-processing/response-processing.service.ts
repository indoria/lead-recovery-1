import { Inject, Injectable } from '@nestjs/common';
import { LocalAudioCache } from '../../adapters/audio-cache/local-audio-cache';
import { LLMAdapter, LLMMessage } from '../../adapters/llm/llm-adapter.interface';
import { LLM_ADAPTER, STT_ADAPTER, TELEPHONY_ADAPTER, TTS_ADAPTER } from '../../adapters/integration.tokens';
import { STTAdapter } from '../../adapters/stt/stt-adapter.interface';
import { TelephonyAdapter } from '../../adapters/telephony/telephony-adapter.interface';
import { TTSAdapter } from '../../adapters/tts/tts-adapter.interface';
import { WorkflowModuleError } from '../../common/errors/workflow-module.error';
import { ExecutionContext } from '../../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput, ValidationError } from '../../common/interfaces/module.types';
import { WorkflowModule } from '../../common/interfaces/workflow-module.interface';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TranscriptEntry } from '../../common/models/call-session.model';
import { Objection } from '../../common/models/funnel.model';
import { IntentClassifierService } from '../../services/intent-classifier.service';
import { ConversationStrategy } from '../phase2.types';

export interface ResponseProcessingInput extends ModuleInput {
  providerCallId: string;
  audioBuffer: Buffer;
  conversationHistory: TranscriptEntry[];
  conversationStrategy: ConversationStrategy;
}

export interface ResponseProcessingOutput extends ModuleOutput {
  customerText: string;
  agentText: string;
  agentAudioRef: string;
  intentLabel: string;
  detectedObjection?: Objection;
  turnNumber: number;
}

@Injectable()
export class ResponseProcessingService
  implements WorkflowModule<ResponseProcessingInput, ResponseProcessingOutput>
{
  readonly id = 'response-processing';
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(
    @Inject(STT_ADAPTER)
    private readonly sttAdapter: STTAdapter,
    @Inject(LLM_ADAPTER)
    private readonly llmAdapter: LLMAdapter,
    @Inject(TTS_ADAPTER)
    private readonly ttsAdapter: TTSAdapter,
    @Inject(TELEPHONY_ADAPTER)
    private readonly telephonyAdapter: TelephonyAdapter,
    private readonly audioCache: LocalAudioCache,
    private readonly intentClassifierService: IntentClassifierService,
    private readonly loggerFactory: AppLoggerService,
  ) {
    this.logger = this.loggerFactory.createLogger(this.id);
  }

  async execute(input: ResponseProcessingInput, _context: ExecutionContext): Promise<ResponseProcessingOutput> {
    const validationErrors = this.validateInputs(input);
    if (validationErrors.length > 0) {
      throw new WorkflowModuleError(validationErrors[0].message, this.id);
    }

    let sttResult = await this.sttAdapter.transcribe({
      audioBuffer: input.audioBuffer,
      language: input.conversationStrategy.agentPersona.language,
      sampleRateHz: 16000,
      encoding: 'wav',
    });

    if (sttResult.transcript.trim().length === 0) {
      sttResult = await this.sttAdapter.transcribe({
        audioBuffer: input.audioBuffer,
        language: input.conversationStrategy.agentPersona.language,
        sampleRateHz: 16000,
        encoding: 'wav',
      });
    }

    const turnNumber = input.conversationHistory.filter((entry) => entry.speaker === 'customer').length + 1;
    if (sttResult.transcript.trim().length === 0) {
      return {
        customerText: '',
        agentText: 'I could not hear you clearly. I will connect you to a follow-up workflow.',
        agentAudioRef: 'text-only://stt-empty',
        intentLabel: 'stt-empty',
        turnNumber,
      };
    }

    const intent = this.intentClassifierService.classify(
      sttResult.transcript,
      input.conversationStrategy.anticipatedObjections,
    );

    const historyMessages: LLMMessage[] = input.conversationHistory.slice(-10).map((entry) => ({
      role: entry.speaker === 'agent' ? 'assistant' : 'user',
      content: entry.text,
    } as LLMMessage));

    const messages: LLMMessage[] = [
      { role: 'system', content: input.conversationStrategy.systemPrompt },
      ...historyMessages,
      { role: 'user', content: sttResult.transcript },
    ];

    const llmResult = await this.llmAdapter.complete({
      messages,
      maxTokens: 256,
      temperature: 0.2,
    });

    let agentAudioRef = 'text-only://response-processing';
    try {
      const synthesized = await this.ttsAdapter.synthesize({
        text: llmResult.content,
        voiceId: input.conversationStrategy.agentPersona.voiceId,
        language: input.conversationStrategy.agentPersona.language,
      });

      const cacheHit = await this.audioCache.get(synthesized.cacheKey);
      if (!cacheHit) {
        await this.audioCache.put(synthesized.cacheKey, {
          buffer: synthesized.audioBuffer,
          durationSeconds: synthesized.durationSeconds,
          reference: `audio://${synthesized.cacheKey}`,
        });
      }

      await this.telephonyAdapter.streamAudio(input.providerCallId, synthesized.audioBuffer);
      agentAudioRef = `audio://${synthesized.cacheKey}`;
    } catch (error) {
      this.logger.warn('Falling back to text-only response delivery', {
        providerCallId: input.providerCallId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }

    const output: ResponseProcessingOutput = {
      customerText: sttResult.transcript,
      agentText: llmResult.content,
      agentAudioRef,
      intentLabel: intent.intentLabel,
      detectedObjection: intent.detectedObjection,
      turnNumber,
    };

    this.logger.info('Processed conversation turn', {
      providerCallId: input.providerCallId,
      turnNumber,
      intentLabel: output.intentLabel,
    });

    return output;
  }

  validateInputs(input: ResponseProcessingInput): ValidationError[] {
    const errors: ValidationError[] = [];
    if (typeof input.providerCallId !== 'string' || input.providerCallId.trim().length === 0) {
      errors.push({ field: 'providerCallId', message: 'providerCallId is required' });
    }
    if (!Buffer.isBuffer(input.audioBuffer)) {
      errors.push({ field: 'audioBuffer', message: 'audioBuffer must be a Buffer' });
    }
    if (!Array.isArray(input.conversationHistory)) {
      errors.push({ field: 'conversationHistory', message: 'conversationHistory must be an array' });
    }
    if (!input.conversationStrategy || typeof input.conversationStrategy.systemPrompt !== 'string') {
      errors.push({ field: 'conversationStrategy', message: 'conversationStrategy is required' });
    }
    return errors;
  }

  getDependencies(): string[] {
    return ['welcome-message'];
  }

  isFusable(adjacentModuleId: string): boolean {
    return adjacentModuleId === 'conversation-loop';
  }

  canSkip(_context: ExecutionContext): boolean {
    return false;
  }
}
