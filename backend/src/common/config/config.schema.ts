import Ajv, { JSONSchemaType } from 'ajv';

export interface ResolvedConfig {
  app: {
    name: string;
    environment: string;
    port: number;
  };
  crm: {
    adapter: 'mock' | 'internal' | 'salesforce' | 'hubspot';
    baseUrl: string;
    apiKeyEnvVar: string;
    timeout: number;
    supportsContextFusion: boolean;
  };
  stt: {
    provider: 'mock' | 'sarvam';
    sarvam: {
      baseUrl: string;
      apiKeyEnvVar: string;
      timeoutMs: number;
      retry429Ms: number;
      fallbackToMockOn5xx: boolean;
    };
  };
  tts: {
    provider: 'mock' | 'elevenlabs';
    elevenLabs: {
      baseUrl: string;
      apiKeyEnvVar: string;
      timeoutMs: number;
      cacheTtlDays: number;
      defaultVoiceId: string;
    };
  };
  telephony: {
    provider: 'mock' | 'twilio' | 'exotel';
    playsWelcomeOnConnect: boolean;
    fromNumber: string;
    twilio: {
      accountSidEnvVar: string;
      authTokenEnvVar: string;
      baseUrl: string;
      timeoutMs: number;
    };
    exotel: {
      accountSidEnvVar: string;
      authTokenEnvVar: string;
      subdomain: string;
      timeoutMs: number;
    };
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    format: 'json' | 'pretty';
    correlationIdHeader: string;
  };
  llm: {
    provider: 'mock' | 'gemini';
    hasBuiltInDeviation: boolean;
    maxPromptTokens: number;
    gemini: {
      baseUrl: string;
      model: string;
      apiKeyEnvVar: string;
      timeoutMs: number;
    };
  };
  outreach: {
    preferredChannel: 'call' | 'sms' | 'email' | 'whatsapp';
  };
  conversationalAi: {
    useFullService: boolean;
  };
  analytics: {
    enabled: boolean;
  };
  scheduling: {
    maxCallAttempts: number;
    retryIntervalMinutes: number;
  };
  security: {
    encryptionKeyEnvVar: string;
    jwtSecret: string;
  };
}

const schema: JSONSchemaType<ResolvedConfig> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'app',
    'crm',
    'stt',
    'tts',
    'telephony',
    'logging',
    'llm',
    'outreach',
    'conversationalAi',
    'analytics',
    'scheduling',
    'security',
  ],
  properties: {
    app: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'environment', 'port'],
      properties: {
        name: { type: 'string' },
        environment: { type: 'string' },
        port: { type: 'integer' },
      },
    },
    crm: {
      type: 'object',
      additionalProperties: false,
      required: ['adapter', 'baseUrl', 'apiKeyEnvVar', 'timeout', 'supportsContextFusion'],
      properties: {
        adapter: { type: 'string', enum: ['mock', 'internal', 'salesforce', 'hubspot'] },
        baseUrl: { type: 'string' },
        apiKeyEnvVar: { type: 'string' },
        timeout: { type: 'integer' },
        supportsContextFusion: { type: 'boolean' },
      },
    },
    stt: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'sarvam'],
      properties: {
        provider: { type: 'string', enum: ['mock', 'sarvam'] },
        sarvam: {
          type: 'object',
          additionalProperties: false,
          required: ['baseUrl', 'apiKeyEnvVar', 'timeoutMs', 'retry429Ms', 'fallbackToMockOn5xx'],
          properties: {
            baseUrl: { type: 'string' },
            apiKeyEnvVar: { type: 'string' },
            timeoutMs: { type: 'integer' },
            retry429Ms: { type: 'integer' },
            fallbackToMockOn5xx: { type: 'boolean' },
          },
        },
      },
    },
    tts: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'elevenLabs'],
      properties: {
        provider: { type: 'string', enum: ['mock', 'elevenlabs'] },
        elevenLabs: {
          type: 'object',
          additionalProperties: false,
          required: ['baseUrl', 'apiKeyEnvVar', 'timeoutMs', 'cacheTtlDays', 'defaultVoiceId'],
          properties: {
            baseUrl: { type: 'string' },
            apiKeyEnvVar: { type: 'string' },
            timeoutMs: { type: 'integer' },
            cacheTtlDays: { type: 'integer' },
            defaultVoiceId: { type: 'string' },
          },
        },
      },
    },
    telephony: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'playsWelcomeOnConnect', 'fromNumber', 'twilio', 'exotel'],
      properties: {
        provider: { type: 'string', enum: ['mock', 'twilio', 'exotel'] },
        playsWelcomeOnConnect: { type: 'boolean' },
        fromNumber: { type: 'string' },
        twilio: {
          type: 'object',
          additionalProperties: false,
          required: ['accountSidEnvVar', 'authTokenEnvVar', 'baseUrl', 'timeoutMs'],
          properties: {
            accountSidEnvVar: { type: 'string' },
            authTokenEnvVar: { type: 'string' },
            baseUrl: { type: 'string' },
            timeoutMs: { type: 'integer' },
          },
        },
        exotel: {
          type: 'object',
          additionalProperties: false,
          required: ['accountSidEnvVar', 'authTokenEnvVar', 'subdomain', 'timeoutMs'],
          properties: {
            accountSidEnvVar: { type: 'string' },
            authTokenEnvVar: { type: 'string' },
            subdomain: { type: 'string' },
            timeoutMs: { type: 'integer' },
          },
        },
      },
    },
    logging: {
      type: 'object',
      additionalProperties: false,
      required: ['level', 'format', 'correlationIdHeader'],
      properties: {
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'fatal'] },
        format: { type: 'string', enum: ['json', 'pretty'] },
        correlationIdHeader: { type: 'string' },
      },
    },
    llm: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'hasBuiltInDeviation', 'maxPromptTokens', 'gemini'],
      properties: {
        provider: { type: 'string', enum: ['mock', 'gemini'] },
        hasBuiltInDeviation: { type: 'boolean' },
        maxPromptTokens: { type: 'integer' },
        gemini: {
          type: 'object',
          additionalProperties: false,
          required: ['baseUrl', 'model', 'apiKeyEnvVar', 'timeoutMs'],
          properties: {
            baseUrl: { type: 'string' },
            model: { type: 'string' },
            apiKeyEnvVar: { type: 'string' },
            timeoutMs: { type: 'integer' },
          },
        },
      },
    },
    outreach: {
      type: 'object',
      additionalProperties: false,
      required: ['preferredChannel'],
      properties: {
        preferredChannel: { type: 'string', enum: ['call', 'sms', 'email', 'whatsapp'] },
      },
    },
    conversationalAi: {
      type: 'object',
      additionalProperties: false,
      required: ['useFullService'],
      properties: {
        useFullService: { type: 'boolean' },
      },
    },
    analytics: {
      type: 'object',
      additionalProperties: false,
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean' },
      },
    },
    scheduling: {
      type: 'object',
      additionalProperties: false,
      required: ['maxCallAttempts', 'retryIntervalMinutes'],
      properties: {
        maxCallAttempts: { type: 'integer' },
        retryIntervalMinutes: { type: 'integer' },
      },
    },
    security: {
      type: 'object',
      additionalProperties: false,
      required: ['encryptionKeyEnvVar', 'jwtSecret'],
      properties: {
        encryptionKeyEnvVar: { type: 'string' },
        jwtSecret: { type: 'string' },
      },
    },
  },
};

const ajv = new Ajv({ allErrors: true });
const validator = ajv.compile(schema);

export function validateResolvedConfig(config: unknown): ResolvedConfig {
  if (validator(config)) {
    return config;
  }

  const errors = validator.errors?.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ');
  throw new Error(`Invalid application config: ${errors ?? 'unknown error'}`);
}