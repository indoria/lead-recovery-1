import { Injectable, Optional } from '@nestjs/common';
import { CallEventStoreService } from '../../analytics/call-event-store.service';
import { AppConfigService } from '../config/app-config.service';
import { Logger, LoggerWriteOptions } from './logger.interface';
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
    @Optional() private readonly callEventStore?: CallEventStoreService,
  ) {}

  createLogger(moduleName: string): Logger {
    return {
      debug: (message, metadata, options) => this.write('debug', moduleName, message, metadata, options),
      info: (message, metadata, options) => this.write('info', moduleName, message, metadata, options),
      warn: (message, metadata, options) => this.write('warn', moduleName, message, metadata, options),
      error: (message, metadata, options) => this.write('error', moduleName, message, metadata, options),
      fatal: (message, metadata, options) => this.write('fatal', moduleName, message, metadata, options),
    };
  }

  private write(
    level: LogLevel,
    moduleName: string,
    message: string,
    metadata?: Record<string, unknown>,
    options?: LoggerWriteOptions,
  ): void {
    const config = this.configService.getConfig().logging;
    const configuredLevel = config.level ?? 'info';
    if (!this.shouldWriteForLevel(level, configuredLevel)) {
      return;
    }

    const sinks = {
      console: options?.sinks?.console ?? config.sinks?.console ?? true,
      database: options?.sinks?.database ?? config.sinks?.database ?? false,
    };

    if (!sinks.console && !sinks.database) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: this.correlationIdService.getCorrelationId(),
      module: moduleName,
      message,
      metadata: metadata === undefined ? undefined : this.maskSensitiveFields(metadata),
    };

    if (sinks.database && this.callEventStore) {
      this.callEventStore.recordEvent({
        eventName: 'app.log',
        category: 'workflow',
        direction: 'internal',
        phase: level,
        correlationId: entry.correlationId,
        occurredAt: entry.timestamp,
        payload: {
          module: entry.module,
          level: entry.level,
          message: entry.message,
          metadata: entry.metadata,
        },
      });
    }

    if (!sinks.console) {
      return;
    }

    const format = options?.format ?? config.format ?? 'json';
    const serialized = format === 'pretty'
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    if (level === 'error' || level === 'fatal') {
      console.error(serialized);
      return;
    }

    console.log(serialized);
  }

  private shouldWriteForLevel(level: LogLevel, configuredLevel: LogLevel): boolean {
    const order: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];
    return order.indexOf(level) >= order.indexOf(configuredLevel);
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