import { Injectable } from '@nestjs/common';
import { OutboundApiTracerService } from '../../analytics/outbound-api-tracer.service';
import { AppConfigService } from '../../common/config/app-config.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { MockLLMAdapter } from './mock-llm-adapter';
import { LLMAdapter, LLMRequest, LLMResponse } from './llm-adapter.interface';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

@Injectable()
export class GeminiLLMAdapter implements LLMAdapter {
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(
    private readonly configService: AppConfigService,
    private readonly fallbackAdapter: MockLLMAdapter,
    private readonly apiTracer: OutboundApiTracerService,
    loggerFactory: AppLoggerService,
  ) {
    this.logger = loggerFactory.createLogger('gemini-llm-adapter');
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const config = this.configService.getConfig().llm;
    const estimatedPromptTokens = this.estimatePromptTokens(req);
    if (estimatedPromptTokens > config.maxPromptTokens) {
      throw new Error(`Prompt token estimate ${estimatedPromptTokens} exceeds maxPromptTokens ${config.maxPromptTokens}`);
    }

    const apiKey = process.env[config.gemini.apiKeyEnvVar] ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return this.fallbackAdapter.complete(req);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.gemini.timeoutMs);

    try {
      const response = await this.apiTracer.fetch(
        `${config.gemini.baseUrl}/v1beta/models/${config.gemini.model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: req.messages.map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.content }],
            })),
            generationConfig: {
              maxOutputTokens: req.maxTokens,
              temperature: req.temperature,
              stopSequences: req.stopSequences,
            },
          }),
          signal: controller.signal,
        },
        {
          provider: 'gemini',
          operation: 'generate-content',
          metadata: {
            maxTokens: req.maxTokens,
            messageCount: req.messages.length,
            model: config.gemini.model,
            temperature: req.temperature,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Gemini request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as GeminiResponse;
      const content = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const finishReasonRaw = payload.candidates?.[0]?.finishReason?.toLowerCase() ?? 'stop';
      const finishReason: LLMResponse['finishReason'] =
        finishReasonRaw === 'max_tokens' || finishReasonRaw === 'length' ? 'length' : 'stop';

      const output: LLMResponse = {
        content,
        finishReason,
        promptTokens: payload.usageMetadata?.promptTokenCount ?? estimatedPromptTokens,
        completionTokens: payload.usageMetadata?.candidatesTokenCount ?? Math.ceil(content.length / 4),
      };

      this.logger.info('LLM usage captured', {
        provider: 'gemini',
        model: config.gemini.model,
        promptTokens: output.promptTokens,
        completionTokens: output.completionTokens,
      });

      return output;
    } catch {
      return this.fallbackAdapter.complete(req);
    } finally {
      clearTimeout(timeout);
    }
  }

  private estimatePromptTokens(req: LLMRequest): number {
    const totalChars = req.messages.reduce((sum, message) => sum + message.content.length, 0);
    return Math.ceil(totalChars / 4);
  }
}