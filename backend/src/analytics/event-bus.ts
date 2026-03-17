import { Injectable } from '@nestjs/common';
import { AnalyticsPipeline } from './analytics-pipeline';
import { CallEventStoreService } from './call-event-store.service';
import { InMemoryAnalyticsStore } from './in-memory-analytics-store';

export type AnalyticsEvent =
  | { type: 'call.completed'; payload: Record<string, unknown> }
  | { type: 'objection.new'; payload: Record<string, unknown> }
  | { type: 'goal.achieved'; payload: Record<string, unknown> }
  | { type: 'lead.recovered'; payload: Record<string, unknown> }
  | { type: 'lead.escalated'; payload: Record<string, unknown> }
  | { type: 'model.promoted'; payload: Record<string, unknown> }
  | { type: 'telemetry.client'; payload: Record<string, unknown> }
  | { type: 'workflow.failed'; payload: Record<string, unknown> };

@Injectable()
export class EventBus {
  constructor(
    private readonly analyticsStore: InMemoryAnalyticsStore,
    private readonly analyticsPipeline: AnalyticsPipeline,
    private readonly callEventStore: CallEventStoreService,
  ) {}

  emit(event: AnalyticsEvent): void {
    this.analyticsStore.recordEvent(event);
    this.callEventStore.recordEvent({
      eventName: event.type,
      category: 'analytics',
      direction: 'internal',
      phase: 'received',
      callSessionId: this.readOptionalString(event.payload, 'callSessionId'),
      providerCallId: this.readOptionalString(event.payload, 'providerCallId'),
      occurredAt: new Date().toISOString(),
      payload: event.payload,
    });
    this.analyticsPipeline.process(event);
  }

  private readOptionalString(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }
}