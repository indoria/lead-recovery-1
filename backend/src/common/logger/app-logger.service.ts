import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { Logger } from './logger.interface';
import { CorrelationIdService } from './correlation-id.service';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  correlationId?: string;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AppLoggerService {
  constructor(
    private readonly configService: AppConfigService,
    private readonly correlationIdService: CorrelationIdService,
  ) {}

  createLogger(moduleName: string): Logger {
    return {
      debug: (message, metadata) => this.write('debug', moduleName, message, metadata),
      info: (message, metadata) => this.write('info', moduleName, message, metadata),
      warn: (message, metadata) => this.write('warn', moduleName, message, metadata),
      error: (message, metadata) => this.write('error', moduleName, message, metadata),
      fatal: (message, metadata) => this.write('fatal', moduleName, message, metadata),
    };
  }

  private write(level: LogLevel, moduleName: string, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: this.correlationIdService.getCorrelationId(),
      module: moduleName,
      message,
      metadata: metadata === undefined ? undefined : this.maskSensitiveFields(metadata),
    };

    const serialized = this.configService.getConfig().logging.format === 'pretty'
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    if (level === 'error' || level === 'fatal') {
      console.error(serialized);
      return;
    }

    console.log(serialized);
  }

  private maskSensitiveFields(value: Record<string, unknown>): Record<string, unknown>;
  private maskSensitiveFields(value: unknown): unknown;
  private maskSensitiveFields(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.maskSensitiveFields(entry));
    }

    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => {
          if (
            [
              'phone',
              'email',
              'name',
              'jwtSecret',
              'encryptionKey',
              'apiKey',
              'authToken',
              'accountSid',
              'token',
              'authorization',
            ].includes(key)
          ) {
            return [key, this.maskValue(String(nestedValue))];
          }
          return [key, this.maskSensitiveFields(nestedValue)];
        }),
      );
    }

    return value;
  }

  private maskValue(rawValue: string): string {
    if (rawValue.length <= 4) {
      return '****';
    }
    return `${'*'.repeat(Math.max(4, rawValue.length - 4))}${rawValue.slice(-4)}`;
  }
}