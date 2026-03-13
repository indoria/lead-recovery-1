import { Injectable } from '@nestjs/common';
import { CallSession } from '../common/models/call-session.model';
import { AnalyticsEvent } from './event-bus';

@Injectable()
export class InMemoryAnalyticsStore {
  private readonly events: AnalyticsEvent[] = [];
  private readonly callSessions: CallSession[] = [];

  recordEvent(event: AnalyticsEvent): void {
    this.events.push(structuredClone(event));
  }

  saveCallSession(callSession: CallSession): void {
    this.callSessions.push(structuredClone(callSession));
  }

  listEvents(): AnalyticsEvent[] {
    return structuredClone(this.events);
  }

  listCallSessions(): CallSession[] {
    return structuredClone(this.callSessions);
  }
}