import dynamic from "next/dynamic";
import { getAnalyticsSummaryCached } from "@/features/analytics/api";
import type { AnalyticsSummary } from "@/features/analytics/types";
import { ErrorDisplay } from "@/components/ui/error-display";

const AnalyticsSummary = dynamic(() => import("@/components/analytics/AnalyticsSummary").then((mod) => mod.AnalyticsSummary), {
  loading: () => <p>Loading analytics dashboard...</p>,
});

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
      <AnalyticsSummary summary={summary} />
    </section>
  );
}
