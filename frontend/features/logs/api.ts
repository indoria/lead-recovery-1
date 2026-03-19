import { apiClient } from "@/lib/api/client";
import type { LogEntry, LogsResponse, LogFilter } from "./types";
import { logClientEvent } from "@/lib/telemetry/client";

const BASE_URL = "/logs";
const SSE_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api"}/logs/stream`;

export function buildLogsUrl(filters: LogFilter): string {
  const params = new URLSearchParams();

  if (filters.search) {
    params.append("search", filters.search);
  }
  if (filters.level && filters.level !== "all") {
    params.append("level", filters.level);
  }
  if (filters.source && filters.source !== "all") {
    params.append("source", filters.source);
  }
  if (filters.timeRange && filters.timeRange !== "all") {
    params.append("timeRange", filters.timeRange);
  }
  if (filters.page !== undefined) {
    params.append("page", filters.page.toString());
  }
  if (filters.pageSize !== undefined) {
    params.append("pageSize", filters.pageSize.toString());
  }

  const queryString = params.toString();
  return queryString ? `${BASE_URL}?${queryString}` : BASE_URL;
}

export async function getLogs(filters: LogFilter): Promise<LogEntry[]> {
  try {
    const url = buildLogsUrl(filters);
    const response = await apiClient.get<LogsResponse>(url);
    logClientEvent({
      type: "logs_fetched",
      count: response.items?.length || 0,
    });
    return response.items || [];
  } catch (err) {
    logClientEvent({
      type: "logs_fetch_error",
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

/**
 * Subscribe to live logs via Server-Sent Events (SSE)
 * Falls back to polling on connection failure
 */
export function subscribeLogs(
  onLog: (log: LogEntry) => void,
  onError: (error: string) => void,
  onConnect: () => void,
  onDisconnect: () => void,
  abortSignal: AbortSignal
): void {
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelayMs = 2000;
  let eventSource: EventSource | null = null;
  let pollingInterval: NodeJS.Timeout | null = null;
  let isUsingFallback = false;

  function attemptSSEConnection() {
    try {
      logClientEvent({
        type: "logs_sse_connecting",
        retryCount,
      });

      eventSource = new EventSource(SSE_URL);

      eventSource.addEventListener("log", (event: Event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          onLog(data);
          logClientEvent({
            type: "logs_sse_message",
            logId: data.id,
          });
        } catch (parseErr) {
          logClientEvent({
            type: "logs_sse_parse_error",
            error: parseErr instanceof Error ? parseErr.message : "Unknown",
          });
        }
      });

      eventSource.addEventListener("error", () => {
        logClientEvent({
          type: "logs_sse_error",
          retryCount,
        });

        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }

        retryCount++;
        if (retryCount >= maxRetries) {
          logClientEvent({
            type: "logs_fallback_to_polling",
          });
          isUsingFallback = true;
          startPollingFallback();
        } else {
          setTimeout(attemptSSEConnection, retryDelayMs);
        }
      });

      eventSource.addEventListener("open", () => {
        retryCount = 0;
        onConnect();
        logClientEvent({
          type: "logs_sse_connected",
        });
      });
    } catch (err) {
      logClientEvent({
        type: "logs_sse_connection_error",
        error: err instanceof Error ? err.message : "Unknown",
      });
      retryCount++;
      if (retryCount >= maxRetries) {
        isUsingFallback = true;
        startPollingFallback();
      } else {
        setTimeout(attemptSSEConnection, retryDelayMs);
      }
    }
  }

  function startPollingFallback() {
    onConnect();
    let lastFetch = new Date();

    pollingInterval = setInterval(async () => {
      try {
        const filters: LogFilter = { timeRange: "last-hour", pageSize: 50 };
        const logs = await getLogs(filters);

        // Only emit logs newer than last fetch
        logs.forEach((log) => {
          const logTime = new Date(log.timestamp);
          if (logTime > lastFetch) {
            onLog(log);
          }
        });

        lastFetch = new Date();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Polling error");
        logClientEvent({
          type: "logs_polling_error",
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
    }, 5000);
  }

  function cleanup() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    onDisconnect();
    logClientEvent({
      type: "logs_stream_disconnected",
      usedFallback: isUsingFallback,
    });
  }

  abortSignal.addEventListener("abort", cleanup);
  attemptSSEConnection();
}

export async function exportLogs(filters: LogFilter, format: "json" | "csv" = "json"): Promise<Blob> {
  try {
    const logs = await getLogs({ ...filters, pageSize: 10000 });
    let content: string;

    if (format === "csv") {
      const header = "Timestamp,Level,Source,Agent,Message\n";
      const rows = logs
        .map(
          (log) =>
            `"${log.timestamp}","${log.level}","${log.source}","${log.agent || ""}","${log.message.replace(/"/g, '""')}"`
        )
        .join("\n");
      content = header + rows;
    } else {
      content = JSON.stringify(logs, null, 2);
    }

    logClientEvent({
      type: "logs_exported",
      format,
      count: logs.length,
    });

    return new Blob([content], { type: format === "csv" ? "text/csv" : "application/json" });
  } catch (err) {
    logClientEvent({
      type: "logs_export_error",
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
