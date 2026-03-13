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
    timeout: number;
    supportsContextFusion: boolean;
  };
  telephony: {
    playsWelcomeOnConnect: boolean;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    format: 'json' | 'pretty';
    correlationIdHeader: string;
  };
  llm: {
    hasBuiltInDeviation: boolean;
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
  required: ['app', 'crm', 'telephony', 'logging', 'llm', 'conversationalAi', 'analytics', 'scheduling', 'security'],
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
      required: ['adapter', 'baseUrl', 'timeout', 'supportsContextFusion'],
      properties: {
        adapter: { type: 'string', enum: ['mock', 'internal', 'salesforce', 'hubspot'] },
        baseUrl: { type: 'string' },
        timeout: { type: 'integer' },
        supportsContextFusion: { type: 'boolean' },
      },
    },
    telephony: {
      type: 'object',
      additionalProperties: false,
      required: ['playsWelcomeOnConnect'],
      properties: {
        playsWelcomeOnConnect: { type: 'boolean' },
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
      required: ['hasBuiltInDeviation'],
      properties: {
        hasBuiltInDeviation: { type: 'boolean' },
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