import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CallEventStoreService } from './call-event-store.service';

export interface TracedFetchOptions {
  provider: string;
  operation: string;
  callSessionId?: string;
  providerCallId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class OutboundApiTracerService {
  constructor(private readonly callEventStore: CallEventStoreService) {}

  async fetch(url: string, init: RequestInit, options: TracedFetchOptions): Promise<Response> {
    const requestId = randomUUID();
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    const method = String(init.method ?? 'GET').toUpperCase();

    this.callEventStore.recordEvent({
      eventName: 'third_party_api',
      category: 'third-party-api',
      direction: 'outbound',
      phase: 'start',
      provider: options.provider,
      operation: options.operation,
      method,
      path: url,
      requestId,
      callSessionId: options.callSessionId,
      providerCallId: options.providerCallId,
      occurredAt: startedAt,
      payload: options.metadata,
    });

    try {
      const response = await fetch(url, init);
      this.callEventStore.recordEvent({
        eventName: 'third_party_api',
        category: 'third-party-api',
        direction: 'outbound',
        phase: 'end',
        provider: options.provider,
        operation: options.operation,
        method,
        path: url,
        statusCode: response.status,
        success: response.ok,
        requestId,
        callSessionId: options.callSessionId,
        providerCallId: options.providerCallId,
        occurredAt: new Date().toISOString(),
        relatedStartedAt: startedAt,
        durationMs: Date.now() - startedAtMs,
        payload: options.metadata,
      });
      return response;
    } catch (error) {
      this.callEventStore.recordEvent({
        eventName: 'third_party_api',
        category: 'third-party-api',
        direction: 'outbound',
        phase: 'end',
        provider: options.provider,
        operation: options.operation,
        method,
        path: url,
        success: false,
        requestId,
        callSessionId: options.callSessionId,
        providerCallId: options.providerCallId,
        occurredAt: new Date().toISOString(),
        relatedStartedAt: startedAt,
        durationMs: Date.now() - startedAtMs,
        payload: {
          ...(options.metadata ?? {}),
          errorMessage: error instanceof Error ? error.message : 'unknown',
        },
      });
      throw error;
    }
  }
}