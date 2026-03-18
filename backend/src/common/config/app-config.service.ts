import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { ResolvedConfig, validateResolvedConfig } from './config.schema';

type PlainObject = Record<string, unknown>;

@Injectable()
export class AppConfigService {
  private readonly config: ResolvedConfig;

  constructor() {
    this.config = this.load();
  }

  getConfig(): ResolvedConfig {
    return this.config;
  }

  private load(): ResolvedConfig {
    const defaultConfig = this.loadYaml('default.yaml');
    const environmentName = process.env.NODE_ENV;
    const environmentConfig = environmentName ? this.loadYaml(`${environmentName}.yaml`, false) : {};
    const envOverrides = this.loadEnvOverrides();
    return validateResolvedConfig(this.deepMerge(defaultConfig, environmentConfig, envOverrides));
  }

  private loadYaml(fileName: string, required = true): PlainObject {
    const configPath = join(process.cwd(), 'config', fileName);
    if (!existsSync(configPath)) {
      if (required) {
        throw new Error(`Missing config file: ${configPath}`);
      }
      return {};
    }

    const content = readFileSync(configPath, 'utf8');
    return (yaml.load(content) as PlainObject | undefined) ?? {};
  }

  private loadEnvOverrides(): PlainObject {
    const overrides: PlainObject = {};

    if (process.env.APP_NAME !== undefined) {
      overrides.app = { ...(overrides.app as PlainObject | undefined), name: process.env.APP_NAME };
    }

    if (process.env.APP_ENVIRONMENT !== undefined) {
      overrides.app = { ...(overrides.app as PlainObject | undefined), environment: process.env.APP_ENVIRONMENT };
    }

    if (process.env.APP_PORT !== undefined) {
      overrides.app = { ...(overrides.app as PlainObject | undefined), port: Number(process.env.APP_PORT) };
    }

    if (process.env.CRM_API_KEY_ENV_VAR !== undefined) {
      overrides.crm = {
        ...(overrides.crm as PlainObject | undefined),
        apiKeyEnvVar: process.env.CRM_API_KEY_ENV_VAR,
      };
    }

    if (process.env.LOG_LEVEL !== undefined) {
      overrides.logging = { ...(overrides.logging as PlainObject | undefined), level: process.env.LOG_LEVEL };
    }

    if (process.env.LOG_FORMAT !== undefined) {
      overrides.logging = { ...(overrides.logging as PlainObject | undefined), format: process.env.LOG_FORMAT };
    }

    if (process.env.LOG_CORRELATION_ID_HEADER !== undefined) {
      overrides.logging = {
        ...(overrides.logging as PlainObject | undefined),
        correlationIdHeader: process.env.LOG_CORRELATION_ID_HEADER,
      };
    }

    if (process.env.LOG_SINK_CONSOLE !== undefined) {
      overrides.logging = {
        ...(overrides.logging as PlainObject | undefined),
        sinks: {
          ...(((overrides.logging as PlainObject | undefined)?.sinks as PlainObject | undefined) ?? {}),
          console: this.parseBooleanEnv(process.env.LOG_SINK_CONSOLE),
        },
      };
    }

    if (process.env.LOG_SINK_DATABASE !== undefined) {
      overrides.logging = {
        ...(overrides.logging as PlainObject | undefined),
        sinks: {
          ...(((overrides.logging as PlainObject | undefined)?.sinks as PlainObject | undefined) ?? {}),
          database: this.parseBooleanEnv(process.env.LOG_SINK_DATABASE),
        },
      };
    }

    if (process.env.JWT_SECRET !== undefined) {
      overrides.security = { ...(overrides.security as PlainObject | undefined), jwtSecret: process.env.JWT_SECRET };
    }

    if (process.env.CRM_ADAPTER !== undefined) {
      overrides.crm = { ...(overrides.crm as PlainObject | undefined), adapter: process.env.CRM_ADAPTER };
    }

    if (process.env.CRM_BASE_URL !== undefined) {
      overrides.crm = {
        ...(overrides.crm as PlainObject | undefined),
        baseUrl: process.env.CRM_BASE_URL,
      };
    }

    if (process.env.CRM_TIMEOUT !== undefined) {
      overrides.crm = {
        ...(overrides.crm as PlainObject | undefined),
        timeout: Number(process.env.CRM_TIMEOUT),
      };
    }

    if (process.env.CRM_SUPPORTS_CONTEXT_FUSION !== undefined) {
      overrides.crm = {
        ...(overrides.crm as PlainObject | undefined),
        supportsContextFusion: this.parseBooleanEnv(process.env.CRM_SUPPORTS_CONTEXT_FUSION),
      };
    }

    if (process.env.STT_PROVIDER !== undefined) {
      overrides.stt = { ...(overrides.stt as PlainObject | undefined), provider: process.env.STT_PROVIDER };
    }

    if (process.env.STT_SARVAM_BASE_URL !== undefined) {
      overrides.stt = {
        ...(overrides.stt as PlainObject | undefined),
        sarvam: {
          ...(((overrides.stt as PlainObject | undefined)?.sarvam as PlainObject | undefined) ?? {}),
          baseUrl: process.env.STT_SARVAM_BASE_URL,
        },
      };
    }

    if (process.env.STT_SARVAM_API_KEY_ENV_VAR !== undefined) {
      overrides.stt = {
        ...(overrides.stt as PlainObject | undefined),
        sarvam: {
          ...(((overrides.stt as PlainObject | undefined)?.sarvam as PlainObject | undefined) ?? {}),
          apiKeyEnvVar: process.env.STT_SARVAM_API_KEY_ENV_VAR,
        },
      };
    }

    if (process.env.STT_SARVAM_TIMEOUT_MS !== undefined) {
      overrides.stt = {
        ...(overrides.stt as PlainObject | undefined),
        sarvam: {
          ...(((overrides.stt as PlainObject | undefined)?.sarvam as PlainObject | undefined) ?? {}),
          timeoutMs: this.parseNumberEnv(process.env.STT_SARVAM_TIMEOUT_MS, 5000),
        },
      };
    }

    if (process.env.STT_SARVAM_RETRY_429_MS !== undefined) {
      overrides.stt = {
        ...(overrides.stt as PlainObject | undefined),
        sarvam: {
          ...(((overrides.stt as PlainObject | undefined)?.sarvam as PlainObject | undefined) ?? {}),
          retry429Ms: this.parseNumberEnv(process.env.STT_SARVAM_RETRY_429_MS, 1200),
        },
      };
    }

    if (process.env.STT_SARVAM_FALLBACK_TO_MOCK_ON_5XX !== undefined) {
      overrides.stt = {
        ...(overrides.stt as PlainObject | undefined),
        sarvam: {
          ...(((overrides.stt as PlainObject | undefined)?.sarvam as PlainObject | undefined) ?? {}),
          fallbackToMockOn5xx: this.parseBooleanEnv(process.env.STT_SARVAM_FALLBACK_TO_MOCK_ON_5XX),
        },
      };
    }

    if (process.env.TTS_PROVIDER !== undefined) {
      overrides.tts = { ...(overrides.tts as PlainObject | undefined), provider: process.env.TTS_PROVIDER };
    }

    if (process.env.TTS_ELEVENLABS_BASE_URL !== undefined) {
      overrides.tts = {
        ...(overrides.tts as PlainObject | undefined),
        elevenLabs: {
          ...(((overrides.tts as PlainObject | undefined)?.elevenLabs as PlainObject | undefined) ?? {}),
          baseUrl: process.env.TTS_ELEVENLABS_BASE_URL,
        },
      };
    }

    if (process.env.TTS_ELEVENLABS_API_KEY_ENV_VAR !== undefined) {
      overrides.tts = {
        ...(overrides.tts as PlainObject | undefined),
        elevenLabs: {
          ...(((overrides.tts as PlainObject | undefined)?.elevenLabs as PlainObject | undefined) ?? {}),
          apiKeyEnvVar: process.env.TTS_ELEVENLABS_API_KEY_ENV_VAR,
        },
      };
    }

    if (process.env.TTS_ELEVENLABS_TIMEOUT_MS !== undefined) {
      overrides.tts = {
        ...(overrides.tts as PlainObject | undefined),
        elevenLabs: {
          ...(((overrides.tts as PlainObject | undefined)?.elevenLabs as PlainObject | undefined) ?? {}),
          timeoutMs: this.parseNumberEnv(process.env.TTS_ELEVENLABS_TIMEOUT_MS, 5000),
        },
      };
    }

    if (process.env.TTS_ELEVENLABS_CACHE_TTL_DAYS !== undefined) {
      overrides.tts = {
        ...(overrides.tts as PlainObject | undefined),
        elevenLabs: {
          ...(((overrides.tts as PlainObject | undefined)?.elevenLabs as PlainObject | undefined) ?? {}),
          cacheTtlDays: this.parseNumberEnv(process.env.TTS_ELEVENLABS_CACHE_TTL_DAYS, 7),
        },
      };
    }

    if (process.env.TTS_ELEVENLABS_DEFAULT_VOICE_ID !== undefined) {
      overrides.tts = {
        ...(overrides.tts as PlainObject | undefined),
        elevenLabs: {
          ...(((overrides.tts as PlainObject | undefined)?.elevenLabs as PlainObject | undefined) ?? {}),
          defaultVoiceId: process.env.TTS_ELEVENLABS_DEFAULT_VOICE_ID,
        },
      };
    }

    if (process.env.TELEPHONY_PROVIDER !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        provider: process.env.TELEPHONY_PROVIDER,
      };
    }

    if (process.env.TELEPHONY_PLAYS_WELCOME_ON_CONNECT !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        playsWelcomeOnConnect: this.parseBooleanEnv(process.env.TELEPHONY_PLAYS_WELCOME_ON_CONNECT),
      };
    }

    if (process.env.TELEPHONY_FROM_NUMBER !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        fromNumber: process.env.TELEPHONY_FROM_NUMBER,
      };
    }

    if (process.env.TWILIO_ACCOUNT_SID_ENV_VAR !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        twilio: {
          ...(((overrides.telephony as PlainObject | undefined)?.twilio as PlainObject | undefined) ?? {}),
          accountSidEnvVar: process.env.TWILIO_ACCOUNT_SID_ENV_VAR,
        },
      };
    }

    if (process.env.TWILIO_AUTH_TOKEN_ENV_VAR !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        twilio: {
          ...(((overrides.telephony as PlainObject | undefined)?.twilio as PlainObject | undefined) ?? {}),
          authTokenEnvVar: process.env.TWILIO_AUTH_TOKEN_ENV_VAR,
        },
      };
    }

    if (process.env.TWILIO_BASE_URL !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        twilio: {
          ...(((overrides.telephony as PlainObject | undefined)?.twilio as PlainObject | undefined) ?? {}),
          baseUrl: process.env.TWILIO_BASE_URL,
        },
      };
    }

    if (process.env.TWILIO_TIMEOUT_MS !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        twilio: {
          ...(((overrides.telephony as PlainObject | undefined)?.twilio as PlainObject | undefined) ?? {}),
          timeoutMs: this.parseNumberEnv(process.env.TWILIO_TIMEOUT_MS, 5000),
        },
      };
    }

    if (process.env.EXOTEL_ACCOUNT_SID_ENV_VAR !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        exotel: {
          ...(((overrides.telephony as PlainObject | undefined)?.exotel as PlainObject | undefined) ?? {}),
          accountSidEnvVar: process.env.EXOTEL_ACCOUNT_SID_ENV_VAR,
        },
      };
    }

    if (process.env.EXOTEL_AUTH_TOKEN_ENV_VAR !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        exotel: {
          ...(((overrides.telephony as PlainObject | undefined)?.exotel as PlainObject | undefined) ?? {}),
          authTokenEnvVar: process.env.EXOTEL_AUTH_TOKEN_ENV_VAR,
        },
      };
    }

    if (process.env.EXOTEL_SUBDOMAIN !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        exotel: {
          ...(((overrides.telephony as PlainObject | undefined)?.exotel as PlainObject | undefined) ?? {}),
          subdomain: process.env.EXOTEL_SUBDOMAIN,
        },
      };
    }

    if (process.env.EXOTEL_TIMEOUT_MS !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        exotel: {
          ...(((overrides.telephony as PlainObject | undefined)?.exotel as PlainObject | undefined) ?? {}),
          timeoutMs: this.parseNumberEnv(process.env.EXOTEL_TIMEOUT_MS, 5000),
        },
      };
    }

    if (process.env.LLM_PROVIDER !== undefined) {
      overrides.llm = { ...(overrides.llm as PlainObject | undefined), provider: process.env.LLM_PROVIDER };
    }

    if (process.env.LLM_MAX_PROMPT_TOKENS !== undefined) {
      overrides.llm = {
        ...(overrides.llm as PlainObject | undefined),
        maxPromptTokens: Number(process.env.LLM_MAX_PROMPT_TOKENS),
      };
    }

    if (process.env.LLM_HAS_BUILT_IN_DEVIATION !== undefined) {
      overrides.llm = {
        ...(overrides.llm as PlainObject | undefined),
        hasBuiltInDeviation: this.parseBooleanEnv(process.env.LLM_HAS_BUILT_IN_DEVIATION),
      };
    }

    if (process.env.LLM_GEMINI_BASE_URL !== undefined) {
      overrides.llm = {
        ...(overrides.llm as PlainObject | undefined),
        gemini: {
          ...(((overrides.llm as PlainObject | undefined)?.gemini as PlainObject | undefined) ?? {}),
          baseUrl: process.env.LLM_GEMINI_BASE_URL,
        },
      };
    }

    if (process.env.LLM_GEMINI_MODEL !== undefined) {
      overrides.llm = {
        ...(overrides.llm as PlainObject | undefined),
        gemini: {
          ...(((overrides.llm as PlainObject | undefined)?.gemini as PlainObject | undefined) ?? {}),
          model: process.env.LLM_GEMINI_MODEL,
        },
      };
    }

    if (process.env.LLM_GEMINI_API_KEY_ENV_VAR !== undefined) {
      overrides.llm = {
        ...(overrides.llm as PlainObject | undefined),
        gemini: {
          ...(((overrides.llm as PlainObject | undefined)?.gemini as PlainObject | undefined) ?? {}),
          apiKeyEnvVar: process.env.LLM_GEMINI_API_KEY_ENV_VAR,
        },
      };
    }

    if (process.env.LLM_GEMINI_TIMEOUT_MS !== undefined) {
      overrides.llm = {
        ...(overrides.llm as PlainObject | undefined),
        gemini: {
          ...(((overrides.llm as PlainObject | undefined)?.gemini as PlainObject | undefined) ?? {}),
          timeoutMs: this.parseNumberEnv(process.env.LLM_GEMINI_TIMEOUT_MS, 7000),
        },
      };
    }

    if (process.env.OUTREACH_PREFERRED_CHANNEL !== undefined) {
      overrides.outreach = {
        ...(overrides.outreach as PlainObject | undefined),
        preferredChannel: process.env.OUTREACH_PREFERRED_CHANNEL,
      };
    }

    if (process.env.CONVERSATIONAL_AI_USE_FULL_SERVICE !== undefined) {
      overrides.conversationalAi = {
        ...(overrides.conversationalAi as PlainObject | undefined),
        useFullService: this.parseBooleanEnv(process.env.CONVERSATIONAL_AI_USE_FULL_SERVICE),
      };
    }

    if (process.env.ANALYTICS_ENABLED !== undefined) {
      overrides.analytics = {
        ...(overrides.analytics as PlainObject | undefined),
        enabled: this.parseBooleanEnv(process.env.ANALYTICS_ENABLED),
      };
    }

    if (process.env.SCHEDULING_MAX_CALL_ATTEMPTS !== undefined) {
      overrides.scheduling = {
        ...(overrides.scheduling as PlainObject | undefined),
        maxCallAttempts: this.parseNumberEnv(process.env.SCHEDULING_MAX_CALL_ATTEMPTS, 3),
      };
    }

    if (process.env.SCHEDULING_RETRY_INTERVAL_MINUTES !== undefined) {
      overrides.scheduling = {
        ...(overrides.scheduling as PlainObject | undefined),
        retryIntervalMinutes: this.parseNumberEnv(process.env.SCHEDULING_RETRY_INTERVAL_MINUTES, 60),
      };
    }

    if (process.env.SECURITY_ENCRYPTION_KEY_ENV_VAR !== undefined) {
      overrides.security = {
        ...(overrides.security as PlainObject | undefined),
        encryptionKeyEnvVar: process.env.SECURITY_ENCRYPTION_KEY_ENV_VAR,
      };
    }

    return overrides;
  }

  private deepMerge(...objects: PlainObject[]): PlainObject {
    return objects.reduce<PlainObject>((accumulator, current) => {
      for (const [key, value] of Object.entries(current)) {
        if (this.isPlainObject(value) && this.isPlainObject(accumulator[key])) {
          accumulator[key] = this.deepMerge(accumulator[key] as PlainObject, value);
        } else {
          accumulator[key] = value;
        }
      }
      return accumulator;
    }, {});
  }

  private isPlainObject(value: unknown): value is PlainObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private parseBooleanEnv(value: string): boolean {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }

  private parseNumberEnv(value: string, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}