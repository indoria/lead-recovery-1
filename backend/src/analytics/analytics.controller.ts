import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AggregateStore } from './aggregate-store';
import { CallEventStoreService, CallEventCategory, CallEventDirection } from './call-event-store.service';
import { AnalyticsQuery } from './analytics.types';
import { InMemoryAnalyticsStore } from './in-memory-analytics-store';
import { TimeSeriesStore } from './time-series-store';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly aggregateStore: AggregateStore,
    private readonly timeSeriesStore: TimeSeriesStore,
    private readonly analyticsStore: InMemoryAnalyticsStore,
    private readonly callEventStore: CallEventStoreService,
  ) {}

  @Get('logs')
  getLogs(
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: CallEventCategory,
    @Query('direction') direction?: CallEventDirection,
    @Query('phase') phase?: string,
    @Query('provider') provider?: string,
    @Query('eventName') eventName?: string,
    @Query('requestId') requestId?: string,
    @Query('callSessionId') callSessionId?: string,
    @Query('providerCallId') providerCallId?: string,
    @Query('module') module?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
  ) {
    const resolvedLimit = limit ? Number(limit) : 150;
    if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1 || resolvedLimit > 1000) {
      throw new BadRequestException('limit must be an integer between 1 and 1000');
    }

    this.validateOptionalDate(from, 'from');
    this.validateOptionalDate(to, 'to');

    return {
      items: this.callEventStore.listEvents({
        limit: resolvedLimit,
        from,
        to,
        category,
        direction,
        phase,
        provider,
        eventName,
        requestId,
        callSessionId,
        providerCallId,
        module,
        level,
        search,
      }),
      serverTime: new Date().toISOString(),
    };
  }

  @Get('summary')
  getSummary() {
    return {
      summary: this.aggregateStore.snapshot(),
    };
  }

  @Get('metrics')
  getMetrics(
    @Query('metric') metric?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('funnelId') funnelId?: string,
    @Query('stageId') stageId?: string,
    @Query('productId') productId?: string,
  ) {
    if (!metric) {
      throw new BadRequestException('metric query parameter is required');
    }

    const parsedFrom = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const parsedTo = to ? new Date(to) : new Date();
    if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) {
      throw new BadRequestException('from and to must be valid ISO date values');
    }

    const query: AnalyticsQuery = {
      metric,
      from: parsedFrom,
      to: parsedTo,
      filters: {
        funnelId,
        stageId,
        productId,
      },
    };

    return this.timeSeriesStore.query(query);
  }

  @Get('funnel-chart')
  getFunnelChart(
    @Query('funnelId') funnelId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: string,
  ) {
    if (!funnelId) {
      throw new BadRequestException('funnelId query parameter is required');
    }

    const range = this.parseDateRange(from, to);
    const sessions = this.analyticsStore
      .listCallSessions()
      .filter((session) => session.funnelId === funnelId)
      .filter((session) => this.inRange(session.endedAt ?? session.startedAt, range.from, range.to));

    const stageStats = new Map<string, { attempted: number; recovered: number }>();
    for (const session of sessions) {
      const stats = stageStats.get(session.stageId) ?? { attempted: 0, recovered: 0 };
      stats.attempted += 1;
      if (session.outcome === 'recovered') {
        stats.recovered += 1;
      }
      stageStats.set(session.stageId, stats);
    }

    const recoveryRates = [...stageStats.values()]
      .map((entry) => (entry.attempted === 0 ? 0 : entry.recovered / entry.attempted));
    const mean = recoveryRates.length === 0
      ? 0
      : recoveryRates.reduce((acc, value) => acc + value, 0) / recoveryRates.length;
    const variance = recoveryRates.length === 0
      ? 0
      : recoveryRates.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / recoveryRates.length;
    const sigma = Math.sqrt(variance);

    const rows = [...stageStats.entries()].map(([stageId, stats]) => {
      const recoveryRate = stats.attempted === 0 ? 0 : stats.recovered / stats.attempted;
      return {
        stageId,
        attempted: stats.attempted,
        recovered: stats.recovered,
        recoveryRate: Number(recoveryRate.toFixed(4)),
        isAnomaly: recoveryRate < (mean - (1.5 * sigma)),
      };
    });

    if (format === 'csv') {
      return {
        format: 'csv',
        data: this.toCsv(
          ['stageId', 'attempted', 'recovered', 'recoveryRate', 'isAnomaly'],
          rows.map((row) => [row.stageId, row.attempted, row.recovered, row.recoveryRate, row.isAnomaly]),
        ),
      };
    }

    return {
      funnelId,
      from: range.from,
      to: range.to,
      stages: rows,
      baseline: {
        meanRecoveryRate: Number(mean.toFixed(4)),
        sigma: Number(sigma.toFixed(4)),
      },
    };
  }

  @Get('objection-heatmap')
  getObjectionHeatmap(
    @Query('funnelId') funnelId?: string,
    @Query('stageId') stageId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: string,
  ) {
    if (!funnelId) {
      throw new BadRequestException('funnelId query parameter is required');
    }

    const range = this.parseDateRange(from, to);
    const rows = new Map<string, { stageId: string; objection: string; frequency: number }>();

    for (const event of this.analyticsStore.listEvents()) {
      if (event.type !== 'objection.new') {
        continue;
      }

      const eventFunnelId = this.readString(event.payload.funnelId);
      const eventStageId = this.readString(event.payload.stageId);
      const title = this.readString(event.payload.title) ?? 'unknown';
      if (!eventFunnelId || !eventStageId || eventFunnelId !== funnelId) {
        continue;
      }
      if (stageId && stageId !== eventStageId) {
        continue;
      }

      const key = `${eventStageId}::${title}`;
      const current = rows.get(key) ?? { stageId: eventStageId, objection: title, frequency: 0 };
      current.frequency += 1;
      rows.set(key, current);
    }

    const cells = [...rows.values()].sort((a, b) => b.frequency - a.frequency);
    if (format === 'csv') {
      return {
        format: 'csv',
        data: this.toCsv(
          ['stageId', 'objection', 'frequency'],
          cells.map((cell) => [cell.stageId, cell.objection, cell.frequency]),
        ),
      };
    }

    return {
      funnelId,
      stageId,
      from: range.from,
      to: range.to,
      cells,
    };
  }

  @Get('model-performance')
  getModelPerformance(@Query('modelVersion') modelVersion?: string, @Query('format') format?: string) {
    const from = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const to = new Date();

    const auc = this.timeSeriesStore.query({
      metric: 'models.aucRoc',
      from,
      to,
      filters: {
        modelVersion,
      },
    });
    const precision = this.timeSeriesStore.query({
      metric: 'models.precision',
      from,
      to,
      filters: {
        modelVersion,
      },
    });
    const recall = this.timeSeriesStore.query({
      metric: 'models.recall',
      from,
      to,
      filters: {
        modelVersion,
      },
    });

    const rows = auc.dataPoints.map((point, index) => ({
      timestamp: point.timestamp,
      aucRoc: point.value,
      precision: precision.dataPoints[index]?.value ?? 0,
      recall: recall.dataPoints[index]?.value ?? 0,
    }));

    if (format === 'csv') {
      return {
        format: 'csv',
        data: this.toCsv(
          ['timestamp', 'aucRoc', 'precision', 'recall'],
          rows.map((row) => [row.timestamp.toISOString(), row.aucRoc, row.precision, row.recall]),
        ),
      };
    }

    return {
      modelVersion,
      trend: rows,
      latest: rows[rows.length - 1] ?? null,
    };
  }

  @Get('cohorts')
  getCohorts(
    @Query('groupBy') groupBy?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: string,
  ) {
    if (groupBy && groupBy !== 'week') {
      throw new BadRequestException('groupBy must be week when provided');
    }

    const range = this.parseDateRange(from, to);
    const sessions = this.analyticsStore.listCallSessions()
      .filter((session) => this.inRange(session.startedAt ?? session.endedAt, range.from, range.to));

    const cohorts = new Map<string, { attempted: number; recovered: number }>();
    for (const session of sessions) {
      const date = session.startedAt ?? session.endedAt;
      if (!date) {
        continue;
      }
      const cohort = this.weekStart(date);
      const stats = cohorts.get(cohort) ?? { attempted: 0, recovered: 0 };
      stats.attempted += 1;
      if (session.outcome === 'recovered') {
        stats.recovered += 1;
      }
      cohorts.set(cohort, stats);
    }

    const rows = [...cohorts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cohort, stats]) => ({
        cohort,
        attempted: stats.attempted,
        recovered: stats.recovered,
        recoveryRate: Number((stats.recovered / Math.max(1, stats.attempted)).toFixed(4)),
      }));

    if (format === 'csv') {
      return {
        format: 'csv',
        data: this.toCsv(
          ['cohort', 'attempted', 'recovered', 'recoveryRate'],
          rows.map((row) => [row.cohort, row.attempted, row.recovered, row.recoveryRate]),
        ),
      };
    }

    return {
      groupBy: 'week',
      rows,
    };
  }

  @Get('forecast')
  getForecast(
    @Query('metric') metric?: string,
    @Query('days') days?: string,
    @Query('alpha') alpha?: string,
  ) {
    if (metric && metric !== 'conversionRate') {
      throw new BadRequestException('only metric=conversionRate is currently supported');
    }

    const horizon = Number(days ?? '30');
    if (!Number.isInteger(horizon) || horizon <= 0 || horizon > 365) {
      throw new BadRequestException('days must be an integer between 1 and 365');
    }

    const ewmaAlpha = alpha ? Number(alpha) : 0.35;
    if (!Number.isFinite(ewmaAlpha) || ewmaAlpha <= 0 || ewmaAlpha >= 1) {
      throw new BadRequestException('alpha must be a number between 0 and 1');
    }

    const dailyStats = new Map<string, { total: number; recovered: number }>();
    for (const session of this.analyticsStore.listCallSessions()) {
      const date = session.endedAt ?? session.startedAt;
      if (!date) {
        continue;
      }

      const key = date.toISOString().slice(0, 10);
      const stats = dailyStats.get(key) ?? { total: 0, recovered: 0 };
      stats.total += 1;
      if (session.outcome === 'recovered') {
        stats.recovered += 1;
      }
      dailyStats.set(key, stats);
    }

    const observed = [...dailyStats.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        conversionRate: stats.recovered / Math.max(1, stats.total),
      }));

    let ewma = observed.length === 0 ? this.aggregateStore.snapshot().conversionRate : observed[0].conversionRate;
    for (const point of observed) {
      ewma = (ewmaAlpha * point.conversionRate) + ((1 - ewmaAlpha) * ewma);
    }

    const forecast = Array.from({ length: horizon }).map((_, offset) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offset + 1);
      return {
        date: date.toISOString().slice(0, 10),
        expectedConversionRate: Number(ewma.toFixed(4)),
        confidenceLow: Number(Math.max(0, ewma - 0.1).toFixed(4)),
        confidenceHigh: Number(Math.min(1, ewma + 0.1).toFixed(4)),
      };
    });

    return {
      metric: 'conversionRate',
      alpha: ewmaAlpha,
      observed,
      forecast,
    };
  }

  @Get('leads/top')
  getTopLeads(@Query('limit') limit?: string, @Query('funnelId') funnelId?: string) {
    const resolvedLimit = limit ? Number(limit) : 10;
    if (!Number.isInteger(resolvedLimit) || resolvedLimit <= 0 || resolvedLimit > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }

    const sessions = this.analyticsStore.listCallSessions()
      .filter((session) => !funnelId || funnelId === session.funnelId)
      .filter((session) => typeof session.assessmentScore === 'number');

    const top = [...sessions]
      .sort((a, b) => (b.assessmentScore ?? 0) - (a.assessmentScore ?? 0))
      .slice(0, resolvedLimit)
      .map((session) => ({
        leadId: session.leadId,
        callSessionId: session.id,
        funnelId: session.funnelId,
        stageId: session.stageId,
        assessmentScore: session.assessmentScore,
        outcome: session.outcome,
      }));

    return {
      leads: top,
    };
  }

  private parseDateRange(from?: string, to?: string): { from: Date; to: Date } {
    const parsedFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const parsedTo = to ? new Date(to) : new Date();
    if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) {
      throw new BadRequestException('from and to must be valid ISO date values');
    }

    return { from: parsedFrom, to: parsedTo };
  }

  private validateOptionalDate(value: string | undefined, label: 'from' | 'to'): void {
    if (!value) {
      return;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${label} must be a valid ISO date value`);
    }
  }

  private inRange(date: Date | undefined, from: Date, to: Date): boolean {
    if (!date) {
      return false;
    }
    return date >= from && date <= to;
  }

  private weekStart(date: Date): string {
    const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekday = normalized.getUTCDay();
    const diff = weekday === 0 ? -6 : (1 - weekday);
    normalized.setUTCDate(normalized.getUTCDate() + diff);
    return normalized.toISOString().slice(0, 10);
  }

  private toCsv(headers: string[], rows: Array<Array<string | number | boolean>>): string {
    const escape = (value: string | number | boolean): string => {
      const raw = String(value);
      if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
        return `"${raw.replaceAll('"', '""')}"`;
      }
      return raw;
    };

    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(row.map((entry) => escape(entry)).join(','));
    }
    return lines.join('\n');
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }
}