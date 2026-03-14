import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AppConfigService } from '../../common/config/app-config.service';
import { MockTTSAdapter } from './mock-tts-adapter';
import { TTSAdapter, TTSRequest, TTSResponse } from './tts-adapter.interface';

@Injectable()
export class ElevenLabsTTSAdapter implements TTSAdapter {
  constructor(
    private readonly configService: AppConfigService,
    private readonly fallbackAdapter: MockTTSAdapter,
  ) {}

  async synthesize(req: TTSRequest): Promise<TTSResponse> {
    const config = this.configService.getConfig().tts.elevenLabs;
    const apiKey = process.env[config.apiKeyEnvVar] ?? process.env.ELEVEN_LABS_API_KEY;
    const voiceId = req.voiceId || config.defaultVoiceId;

    if (!apiKey) {
      return this.fallbackAdapter.synthesize({ ...req, voiceId });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(`${config.baseUrl}/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: req.text,
          model_id: 'eleven_multilingual_v2',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs TTS request failed with status ${response.status}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const cacheKey = createHash('sha256').update(`${req.text}|${voiceId}|${req.language}`).digest('hex');
      return {
        audioBuffer,
        durationSeconds: Math.max(1, Math.ceil(req.text.length / 24)),
        cacheKey,
      };
    } catch {
      return this.fallbackAdapter.synthesize({ ...req, voiceId });
    } finally {
      clearTimeout(timeout);
    }
  }
}