import { apiClient } from "@/lib/api/client";
import type { CallSession, CallLogEntry } from "./types";
import { logClientEvent } from "@/lib/telemetry/client";

export async function getActiveCalls(): Promise<CallSession[]> {
  try {
    const response = await apiClient.get<{ items: CallSession[] }>("/calls/active");
    const items = Array.isArray(response) ? response : response.items ?? [];
    logClientEvent({ source: "calls-api", message: "Active calls loaded", type: "calls_fetch_active", count: items.length });
    return items;
  } catch (err) {
    logClientEvent({ source: "calls-api", message: "Failed loading active calls", type: "calls_fetch_active_error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export async function getCallHistory(): Promise<CallLogEntry[]> {
  try {
    const response = await apiClient.get<{ items: CallLogEntry[] }>("/calls/log");
    const items = Array.isArray(response) ? response : response.items ?? [];
    logClientEvent({ source: "calls-api", message: "Call history loaded", type: "calls_fetch_history", count: items.length });
    return items;
  } catch (err) {
    logClientEvent({ source: "calls-api", message: "Failed loading call history", type: "calls_fetch_history_error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export async function initiateCall(phone: string): Promise<{ success: boolean; message?: string }> {
  try {
    const payload = await apiClient.post<{ success: boolean; message?: string }>("/calls/manual", { phone });
    logClientEvent({ source: "calls-api", message: "Initiate call", type: "calls_initiate", phone });
    return payload;
  } catch (err) {
    logClientEvent({ source: "calls-api", message: "Failed initiate call", type: "calls_initiate_error", error: err instanceof Error ? err.message : String(err), phone });
    throw err;
  }
}
