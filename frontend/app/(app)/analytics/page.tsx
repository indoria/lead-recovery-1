import { getAnalyticsSummaryCached } from "@/features/analytics/api";
import type { AnalyticsSummary } from "@/features/analytics/types";
import { Card } from "@/components/ui/card";
import { ErrorDisplay } from "@/components/ui/error-display";

export const revalidate = 60;

export const metadata = {
  title: "Analytics - Lead Recovery",
  description: "Analytics overview for lead recovery performance",
};

export default async function AnalyticsPage() {
  let summary: AnalyticsSummary | null = null;

  try {
    summary = await getAnalyticsSummaryCached();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load analytics summary";
    return <ErrorDisplay message={message} />;
  }

  if (!summary) {
    return <ErrorDisplay message="No analytics summary available" />;
  }

  return (
    <section>
      <h1>Analytics</h1>
      <p>High-level performance metrics for call recovery and funnel conversion.</p>

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
    </section>
  );
}
