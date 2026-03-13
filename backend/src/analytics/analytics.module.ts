import { Module } from '@nestjs/common';
import { EventBus } from './event-bus';
import { InMemoryAnalyticsStore } from './in-memory-analytics-store';

@Module({
  providers: [InMemoryAnalyticsStore, EventBus],
  exports: [InMemoryAnalyticsStore, EventBus],
})
export class AnalyticsModule {}