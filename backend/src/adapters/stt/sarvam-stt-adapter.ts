import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { MockSTTAdapter } from './mock-stt-adapter';
import { STTAdapter, STTRequest, STTResponse } from './stt-adapter.interface';

interface SarvamResponse {
  transcript?: string;
  detected_language?: string;
  confidence?: number;
}

@Injectable()
export class SarvamSTTAdapter implements STTAdapter {
  constructor(
    private readonly configService: AppConfigService,
    private readonly fallbackAdapter: MockSTTAdapter,
  ) {}

  async transcribe(req: STTRequest): Promise<STTResponse> {
    const config = this.configService.getConfig().stt.sarvam;
    const apiKey = process.env[config.apiKeyEnvVar] ?? process.env.SARVAM_API_KEY;

    if (!apiKey) {
      return this.fallbackAdapter.transcribe(req);
    }

    const body = new FormData();
    body.append('language_code', req.language);
    body.append('audio', new Blob([new Uint8Array(req.audioBuffer)]), `audio.${req.encoding}`);

    const executeRequest = async (): Promise<Response> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        return await fetch(`${config.baseUrl}/asr`, {
          method: 'POST',
          headers: {
            'api-subscription-key': apiKey,
          },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    };

    let response = await executeRequest();

    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, config.retry429Ms));
      response = await executeRequest();
    }

    if (!response.ok) {
      if (response.status >= 500 && config.fallbackToMockOn5xx) {
        return this.fallbackAdapter.transcribe(req);
      }
      throw new Error(`Sarvam STT request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as SarvamResponse;
    const transcript = payload.transcript ?? '';
    return {
      transcript,
      confidence: payload.confidence ?? (transcript.length > 0 ? 0.8 : 0.3),
      language: payload.detected_language ?? req.language,
    };
  }
}