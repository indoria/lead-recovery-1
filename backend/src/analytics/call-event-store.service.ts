import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';
import { CorrelationIdService } from '../common/logger/correlation-id.service';

export type CallEventCategory = 'analytics' | 'workflow' | 'system-api' | 'webhook' | 'third-party-api';
export type CallEventDirection = 'inbound' | 'outbound' | 'internal';

export interface CallEventRecordInput {
  eventName: string;
  category: CallEventCategory;
  direction: CallEventDirection;
  phase?: string;
  provider?: string;
  operation?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  success?: boolean;
  requestId?: string;
  callSessionId?: string;
  providerCallId?: string;
  correlationId?: string;
  occurredAt?: string;
  relatedStartedAt?: string;
  durationMs?: number;
  payload?: Record<string, unknown>;
}

export interface CallEventQueryOptions {
  limit: number;
  from?: string;
  to?: string;
  category?: CallEventCategory;
  direction?: CallEventDirection;
  phase?: string;
  provider?: string;
  eventName?: string;
  requestId?: string;
  callSessionId?: string;
  providerCallId?: string;
  module?: string;
  level?: string;
  search?: string;
}

export interface StoredCallEvent {
  id: string;
  eventName: string;
  category: CallEventCategory;
  direction: CallEventDirection;
  phase?: string;
  provider?: string;
  operation?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  success?: boolean;
  correlationId?: string;
  requestId?: string;
  callSessionId?: string;
  providerCallId?: string;
  occurredAt: string;
  relatedStartedAt?: string;
  durationMs?: number;
  payload?: Record<string, unknown>;
}

@Injectable()
export class CallEventStoreService {
  private readonly database: DatabaseSync;

  constructor(private readonly correlationIdService: CorrelationIdService) {
    const dbPath = process.env.CALL_EVENT_DB_PATH ?? join(process.cwd(), 'data', 'call-events.sqlite');
    const parentDir = dirname(dbPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    this.database = new DatabaseSync(dbPath);
    this.database.exec('PRAGMA journal_mode = WAL;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS call_events (
        id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        category TEXT NOT NULL,
        direction TEXT NOT NULL,
        phase TEXT,
        provider TEXT,
        operation TEXT,
        method TEXT,
        path TEXT,
        status_code INTEGER,
        success INTEGER,
        correlation_id TEXT,
        request_id TEXT,
        call_session_id TEXT,
        provider_call_id TEXT,
        occurred_at TEXT NOT NULL,
        related_started_at TEXT,
        duration_ms INTEGER,
        payload_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_call_events_occurred_at ON call_events(occurred_at);
      CREATE INDEX IF NOT EXISTS idx_call_events_request_id ON call_events(request_id);
      CREATE INDEX IF NOT EXISTS idx_call_events_provider_call_id ON call_events(provider_call_id);
      CREATE INDEX IF NOT EXISTS idx_call_events_call_session_id ON call_events(call_session_id);
    `);
  }

  recordEvent(input: CallEventRecordInput): void {
    const statement = this.database.prepare(`
      INSERT INTO call_events (
        id,
        event_name,
        category,
        direction,
        phase,
        provider,
        operation,
        method,
        path,
        status_code,
        success,
        correlation_id,
        request_id,
        call_session_id,
        provider_call_id,
        occurred_at,
        related_started_at,
        duration_ms,
        payload_json
      ) VALUES (
        :id,
        :event_name,
        :category,
        :direction,
        :phase,
        :provider,
        :operation,
        :method,
        :path,
        :status_code,
        :success,
        :correlation_id,
        :request_id,
        :call_session_id,
        :provider_call_id,
        :occurred_at,
        :related_started_at,
        :duration_ms,
        :payload_json
      )
    `);

    statement.run({
      id: randomUUID(),
      event_name: input.eventName,
      category: input.category,
      direction: input.direction,
      phase: input.phase ?? null,
      provider: input.provider ?? null,
      operation: input.operation ?? null,
      method: input.method ?? null,
      path: input.path ?? null,
      status_code: input.statusCode ?? null,
      success: typeof input.success === 'boolean' ? Number(input.success) : null,
      correlation_id: input.correlationId ?? this.correlationIdService.getCorrelationId() ?? null,
      request_id: input.requestId ?? null,
      call_session_id: input.callSessionId ?? null,
      provider_call_id: input.providerCallId ?? null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      related_started_at: input.relatedStartedAt ?? null,
      duration_ms: input.durationMs ?? null,
      payload_json: input.payload === undefined ? null : JSON.stringify(this.maskSensitiveFields(input.payload)),
    });
  }

  listEvents(options: CallEventQueryOptions): StoredCallEvent[] {
    const where: string[] = [];
    const params: Record<string, string | number | null> = {
      limit: options.limit,
    };

    if (options.from) {
      where.push('occurred_at >= :from');
      params.from = options.from;
    }

    if (options.to) {
      where.push('occurred_at <= :to');
      params.to = options.to;
    }

    if (options.category) {
      where.push('category = :category');
      params.category = options.category;
    }

    if (options.direction) {
      where.push('direction = :direction');
      params.direction = options.direction;
    }

    if (options.phase) {
      where.push('phase = :phase');
      params.phase = options.phase;
    }

    if (options.provider) {
      where.push('provider = :provider');
      params.provider = options.provider;
    }

    if (options.eventName) {
      where.push('event_name = :event_name');
      params.event_name = options.eventName;
    }

    if (options.requestId) {
      where.push('request_id = :request_id');
      params.request_id = options.requestId;
    }

    if (options.callSessionId) {
      where.push('call_session_id = :call_session_id');
      params.call_session_id = options.callSessionId;
    }

    if (options.providerCallId) {
      where.push('provider_call_id = :provider_call_id');
      params.provider_call_id = options.providerCallId;
    }

    if (options.module) {
      where.push("payload_json LIKE :module_like ESCAPE '\\\\'");
      params.module_like = `%\"module\":\"${this.escapeLike(options.module)}\"%`;
    }

    if (options.level) {
      where.push("payload_json LIKE :level_like ESCAPE '\\\\'");
      params.level_like = `%\"level\":\"${this.escapeLike(options.level)}\"%`;
    }

    if (options.search) {
      const escaped = this.escapeLike(options.search);
      where.push(`(
        event_name LIKE :search_like ESCAPE '\\\\'
        OR category LIKE :search_like ESCAPE '\\\\'
        OR direction LIKE :search_like ESCAPE '\\\\'
        OR COALESCE(phase, '') LIKE :search_like ESCAPE '\\\\'
        OR COALESCE(provider, '') LIKE :search_like ESCAPE '\\\\'
        OR COALESCE(payload_json, '') LIKE :search_like ESCAPE '\\\\'
      )`);
      params.search_like = `%${escaped}%`;
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const statement = this.database.prepare(`
      SELECT
        id,
        event_name,
        category,
        direction,
        phase,
        provider,
        operation,
        method,
        path,
        status_code,
        success,
        correlation_id,
        request_id,
        call_session_id,
        provider_call_id,
        occurred_at,
        related_started_at,
        duration_ms,
        payload_json
      FROM call_events
      ${whereSql}
      ORDER BY occurred_at DESC, id DESC
      LIMIT :limit
    `);

    const rows = statement.all(params) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      eventName: String(row.event_name),
      category: row.category as CallEventCategory,
      direction: row.direction as CallEventDirection,
      phase: this.readOptionalString(row.phase),
      provider: this.readOptionalString(row.provider),
      operation: this.readOptionalString(row.operation),
      method: this.readOptionalString(row.method),
      path: this.readOptionalString(row.path),
      statusCode: this.readOptionalNumber(row.status_code),
      success: this.readOptionalBooleanFromNumber(row.success),
      correlationId: this.readOptionalString(row.correlation_id),
      requestId: this.readOptionalString(row.request_id),
      callSessionId: this.readOptionalString(row.call_session_id),
      providerCallId: this.readOptionalString(row.provider_call_id),
      occurredAt: String(row.occurred_at),
      relatedStartedAt: this.readOptionalString(row.related_started_at),
      durationMs: this.readOptionalNumber(row.duration_ms),
      payload: this.parseOptionalPayload(row.payload_json),
    }));
  }

  private escapeLike(value: string): string {
    return value
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_');
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private readOptionalBooleanFromNumber(value: unknown): boolean | undefined {
    if (typeof value !== 'number') {
      return undefined;
    }
    return value === 1;
  }

  private parseOptionalPayload(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'string' || value.length === 0) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined;
    } catch {
      return undefined;
    }
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
          if (this.isSensitiveKey(key)) {
            return [key, this.maskValue(String(nestedValue))];
          }
          return [key, this.maskSensitiveFields(nestedValue)];
        }),
      );
    }

    return value;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return [
      'phone',
      'tonumber',
      'fromnumber',
      'callerid',
      'email',
      'name',
      'apikey',
      'authtoken',
      'accountsid',
      'token',
      'authorization',
      'jwtsecret',
      'encryptionkey',
    ].includes(normalized);
  }

  private maskValue(rawValue: string): string {
    if (rawValue.length <= 4) {
      return '****';
    }

    return `${'*'.repeat(Math.max(4, rawValue.length - 4))}${rawValue.slice(-4)}`;
  }
}