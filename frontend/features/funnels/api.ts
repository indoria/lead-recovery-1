import { cache } from "react";
import { apiClient } from "@/lib/api/client";
import type { FunnelSummary, FunnelDetail } from "./types";
import { logClientEvent } from "@/lib/telemetry/client";

export async function getFunnels(): Promise<FunnelSummary[]> {
  try {
    const response = await apiClient.get<{ items: FunnelSummary[] }>("/funnels", { cache: "force-cache", next: { revalidate: 60 } });
    const items = Array.isArray(response) ? response : response.items ?? [];
    logClientEvent({ source: "funnels-api", message: "Funnels loaded", type: "funnels_fetch", count: items.length });
    return items;
  } catch (err) {
    logClientEvent({ source: "funnels-api", message: "Failed loading funnels", type: "funnels_fetch_error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export const getFunnelsCached = cache(async (): Promise<FunnelSummary[]> => {
  return getFunnels();
});

export async function getFunnelById(id: string): Promise<FunnelDetail> {
  try {
    const funnel = await apiClient.get<FunnelDetail>(`/funnels/${id}`);
    logClientEvent({ source: "funnels-api", message: "Funnel loaded", type: "funnels_fetch_detail", funnelId: id });
    return funnel;
  } catch (err) {
    logClientEvent({ source: "funnels-api", message: "Failed loading funnel", type: "funnels_fetch_detail_error", funnelId: id, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export const getFunnelByIdCached = cache(async (id: string): Promise<FunnelDetail> => {
  return getFunnelById(id);
});
