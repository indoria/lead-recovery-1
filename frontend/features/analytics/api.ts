import { cache } from "react";
import { apiClient } from "@/lib/api/client";
import type { AnalyticsSummary } from "./types";
import { logClientEvent } from "@/lib/telemetry/client";

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  try {
    const response = await apiClient.get<AnalyticsSummary>("/analytics/summary", { cache: "force-cache", next: { revalidate: 60 } });
    logClientEvent({ source: "analytics-api", message: "Analytics summary loaded", type: "analytics_fetch_summary" });
    return response;
  } catch (err) {
    logClientEvent({ source: "analytics-api", message: "Failed loading analytics summary", type: "analytics_fetch_summary_error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export const getAnalyticsSummaryCached = cache(async (): Promise<AnalyticsSummary> => {
  return getAnalyticsSummary();
});
