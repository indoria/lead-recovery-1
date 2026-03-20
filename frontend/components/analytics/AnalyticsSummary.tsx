"use client";

import type { AnalyticsSummary } from "@/features/analytics/types";
import { Card } from "@/components/ui/card";

type Props = {
  summary: AnalyticsSummary;
};

export function AnalyticsSummary({ summary }: Props) {
  return (
    <div className="grid gap-4" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
      <Card>
        <h2>Total Calls</h2>
        <p>{summary.totalCalls}</p>
      </Card>
      <Card>
        <h2>Recovered</h2>
        <p>{summary.recoveredCalls}</p>
      </Card>
      <Card>
        <h2>Escalated</h2>
        <p>{summary.escalatedCalls}</p>
      </Card>
      <Card>
        <h2>Failed</h2>
        <p>{summary.failedCalls}</p>
      </Card>
      <Card>
        <h2>Avg Duration</h2>
        <p>{summary.averageDurationSeconds.toFixed(1)}s</p>
      </Card>
    </div>
  );
}
