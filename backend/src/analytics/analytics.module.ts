import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AggregateStore } from './aggregate-store';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsPipeline } from './analytics-pipeline';
import { CallEventStoreService } from './call-event-store.service';
import { EventBus } from './event-bus';
import { HttpRequestTracingInterceptor } from './http-request-tracing.interceptor';
import { InMemoryAnalyticsStore } from './in-memory-analytics-store';
import { OutboundApiTracerService } from './outbound-api-tracer.service';
import { TelemetryController } from './telemetry.controller';
import { TimeSeriesStore } from './time-series-store';

@Global()
@Module({
  providers: [
    InMemoryAnalyticsStore,
    AggregateStore,
    TimeSeriesStore,
    AnalyticsPipeline,
    EventBus,
    CallEventStoreService,
    OutboundApiTracerService,
    HttpRequestTracingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: HttpRequestTracingInterceptor,
    },
  ],
  controllers: [AnalyticsController, TelemetryController],
  exports: [
    InMemoryAnalyticsStore,
    AggregateStore,
    TimeSeriesStore,
    AnalyticsPipeline,
    EventBus,
    CallEventStoreService,
    OutboundApiTracerService,
  ],
})
export class AnalyticsModule {}