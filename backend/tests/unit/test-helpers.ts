import { ResolvedConfig } from 'src/common/config/config.schema';
import { ExecutionContext } from 'src/common/interfaces/execution-context.interface';
import { Logger } from 'src/common/logger/logger.interface';

export const testConfig: ResolvedConfig = {
  app: {
    name: 'lead-recovery',
    environment: 'test',
    port: 3001,
  },
  crm: {
    adapter: 'mock',
    baseUrl: '',
    apiKeyEnvVar: 'CRM_API_KEY',
    timeout: 100,
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
  logging: {
    level: 'debug',
    format: 'json',
    correlationIdHeader: 'X-Correlation-ID',
  },
  llm: {
    provider: 'mock',
    hasBuiltInDeviation: false,
    maxPromptTokens: 4000,
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-1.5-flash',
      apiKeyEnvVar: 'GEMINI_API_KEY',
      timeoutMs: 7000,
    },
  },
  outreach: {
    preferredChannel: 'call',
  },
  conversationalAi: {
    useFullService: false,
  },
  analytics: {
    enabled: true,
  },
  scheduling: {
    maxCallAttempts: 3,
    retryIntervalMinutes: 60,
  },
  security: {
    encryptionKeyEnvVar: 'ENCRYPTION_KEY',
    jwtSecret: '',
  },
};

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
};

export function buildExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    correlationId: 'corr_test_001',
    customerId: 'cust_001',
    funnelId: 'funnel_bob_credit_card',
    stageId: 'stage_mobile_verification',
    config: testConfig,
    logger: silentLogger,
    stepOutputs: new Map(),
    ...overrides,
  };
}
