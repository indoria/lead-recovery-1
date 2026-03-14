import { GeminiLLMAdapter } from 'src/adapters/llm/gemini-llm-adapter';
import { MockLLMAdapter } from 'src/adapters/llm/mock-llm-adapter';
import { AppConfigService } from 'src/common/config/app-config.service';
import { ResolvedConfig } from 'src/common/config/config.schema';
import { AppLoggerService } from 'src/common/logger/app-logger.service';

const createConfig = (maxPromptTokens = 4000): ResolvedConfig => ({
  app: { name: 'lead-recovery', environment: 'test', port: 3001 },
  crm: {
    adapter: 'mock',
    baseUrl: '',
    apiKeyEnvVar: 'CRM_API_KEY',
    timeout: 5000,
    supportsContextFusion: false,
  },
  stt: {
    provider: 'mock',
    sarvam: {
      baseUrl: 'https://api.sarvam.ai',
      apiKeyEnvVar: 'SARVAM_API_KEY',
      timeoutMs: 5000,
      retry429Ms: 1200,
      fallbackToMockOn5xx: true,
    },
  },
  tts: {
    provider: 'mock',
    elevenLabs: {
      baseUrl: 'https://api.elevenlabs.io',
      apiKeyEnvVar: 'ELEVEN_LABS_API_KEY',
      timeoutMs: 5000,
      cacheTtlDays: 7,
      defaultVoiceId: 'default',
    },
  },
  telephony: {
    provider: 'mock',
    playsWelcomeOnConnect: false,
    fromNumber: '+910000000000',
    twilio: {
      accountSidEnvVar: 'TWILIO_ACCOUNT_SID',
      authTokenEnvVar: 'TWILIO_AUTH_TOKEN',
      baseUrl: 'https://api.twilio.com',
      timeoutMs: 5000,
    },
    exotel: {
      accountSidEnvVar: 'EXOTEL_ACCOUNT_SID',
      authTokenEnvVar: 'EXOTEL_AUTH_TOKEN',
      subdomain: 'api.exotel.com',
      timeoutMs: 5000,
    },
  },
  logging: { level: 'debug', format: 'json', correlationIdHeader: 'X-Correlation-ID' },
  llm: {
    provider: 'gemini',
    hasBuiltInDeviation: false,
    maxPromptTokens,
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-1.5-flash',
      apiKeyEnvVar: 'GEMINI_API_KEY',
      timeoutMs: 5000,
    },
  },
  outreach: { preferredChannel: 'call' },
  conversationalAi: { useFullService: false },
  analytics: { enabled: true },
  scheduling: { maxCallAttempts: 3, retryIntervalMinutes: 60 },
  security: { encryptionKeyEnvVar: 'ENCRYPTION_KEY', jwtSecret: 'test-secret' },
});

describe('GeminiLLMAdapter', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  });

  it('rejects requests above maxPromptTokens', async () => {
    const configService = {
      getConfig: () => createConfig(2),
    } as AppConfigService;
    const loggerFactory = {
      createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn(),
      }),
    } as unknown as AppLoggerService;

    const adapter = new GeminiLLMAdapter(configService, new MockLLMAdapter(), loggerFactory);

    await expect(
      adapter.complete({
        messages: [{ role: 'user', content: 'this prompt is intentionally too large' }],
        maxTokens: 50,
        temperature: 0.1,
      }),
    ).rejects.toThrow('exceeds maxPromptTokens');
  });

  it('falls back to mock adapter when api key is missing', async () => {
    delete process.env.GEMINI_API_KEY;

    const configService = {
      getConfig: () => createConfig(4000),
    } as AppConfigService;
    const loggerFactory = {
      createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn(),
      }),
    } as unknown as AppLoggerService;

    const adapter = new GeminiLLMAdapter(configService, new MockLLMAdapter(), loggerFactory);
    const response = await adapter.complete({
      messages: [{ role: 'user', content: 'yes, continue' }],
      maxTokens: 60,
      temperature: 0.2,
    });

    expect(response.content.toLowerCase()).toContain('great');
    expect(response.finishReason).toBe('stop');
  });
});