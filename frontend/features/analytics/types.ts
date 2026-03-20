export interface AnalyticsSummary {
  totalCalls: number;
  recoveredCalls: number;
  escalatedCalls: number;
  failedCalls: number;
  averageDurationSeconds: number;
}

export interface AnalyticsPoint {
  label: string;
  value: number;
}
