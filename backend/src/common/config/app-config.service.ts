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

    if (process.env.APP_PORT !== undefined) {
      overrides.app = { port: Number(process.env.APP_PORT) };
    }

    if (process.env.LOG_LEVEL !== undefined) {
      overrides.logging = { ...(overrides.logging as PlainObject | undefined), level: process.env.LOG_LEVEL };
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

    if (process.env.STT_PROVIDER !== undefined) {
      overrides.stt = { ...(overrides.stt as PlainObject | undefined), provider: process.env.STT_PROVIDER };
    }

    if (process.env.TTS_PROVIDER !== undefined) {
      overrides.tts = { ...(overrides.tts as PlainObject | undefined), provider: process.env.TTS_PROVIDER };
    }

    if (process.env.TELEPHONY_PROVIDER !== undefined) {
      overrides.telephony = {
        ...(overrides.telephony as PlainObject | undefined),
        provider: process.env.TELEPHONY_PROVIDER,
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
}