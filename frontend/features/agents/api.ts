import { apiClient } from "@/lib/api/client";
import type { AgentProfile } from "./types";
import { logClientEvent } from "@/lib/telemetry/client";

export async function getAgents(): Promise<AgentProfile[]> {
  try {
    const response = await apiClient.get<{ items: AgentProfile[] }>("/agents");
    const items = Array.isArray(response) ? response : response.items ?? [];
    logClientEvent({ source: "agents-api", message: "Agents loaded", type: "agents_fetch", count: items.length });
    return items;
  } catch (err) {
    logClientEvent({ source: "agents-api", message: "Failed loading agents", type: "agents_fetch_error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
