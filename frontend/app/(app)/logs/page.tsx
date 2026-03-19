"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { LogsFilters, LogsTable } from "@/features/logs/components";
import { getLogs, subscribeLogs, exportLogs } from "@/features/logs/api";
import { logClientEvent } from "@/lib/telemetry/client";
import type { LogEntry, LogFilter } from "@/features/logs/types";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/ui/loading";
import { Empty } from "@/components/ui/empty";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Download, Pause, Play } from "lucide-react";

export default function LogsPage() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<LogFilter>({
    level: undefined,
    source: undefined,
    timeRange: "last-hour",
    pageSize: 100,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [streamStatus, setStreamStatus] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected"
  );
  const [error, setError] = useState<string | null>(null);

  // Fetch initial logs
  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getLogs(filters);
      setLogs(data);
      logClientEvent({
        type: "logs_page_loaded",
        count: data.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load logs";
      setError(message);
      logClientEvent({
        type: "logs_page_error",
        error: message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Initial load
  useEffect(() => {
    fetchLogs();
  }, [filters]);

  // Subscribe to live logs
  const startStream = useCallback(() => {
    logClientEvent({
      type: "logs_stream_start",
    });

    abortControllerRef.current = new AbortController();
    setIsStreamActive(true);

    subscribeLogs(
      (newLog) => {
        setLogs((prev) => [newLog, ...prev].slice(0, 1000));
      },
      (errorMsg) => {
        setError(errorMsg);
        setStreamStatus("disconnected");
        logClientEvent({
          type: "logs_stream_error",
          error: errorMsg,
        });
      },
      () => {
        setStreamStatus("connected");
        logClientEvent({
          type: "logs_stream_connected",
        });
      },
      () => {
        setStreamStatus("disconnected");
        setIsStreamActive(false);
        logClientEvent({
          type: "logs_stream_stopped",
        });
      },
      abortControllerRef.current.signal
    );
  }, []);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    logClientEvent({
      type: "logs_stream_stopped_manual",
    });
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const blob = await exportLogs(filters, "json");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logs-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      logClientEvent({
        type: "logs_exported",
        count: logs.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }, [filters, logs.length]);

  const handleFiltersChange = useCallback((newFilters: LogFilter) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  if (isLoading && logs.length === 0) {
    return <PageLoading />;
  }

  return (
    <div className="logs-page">
      <div className="logs-header">
        <h1>Logs</h1>
        <p className="logs-subtitle">
          {logs.length} logs · Stream status:{" "}
          <span
            className={`status-badge status-badge-${streamStatus}`}
          >
            {streamStatus}
          </span>
        </p>
      </div>

      <div className="logs-toolbar">
        <button
          className={`btn ${isStreamActive ? "btn-secondary" : "btn-primary"}`}
          onClick={isStreamActive ? stopStream : startStream}
        >
          {isStreamActive ? (
            <>
              <Pause size={16} /> Pause Stream
            </>
          ) : (
            <>
              <Play size={16} /> Start Stream
            </>
          )}
        </button>

        <button className="btn btn-secondary" onClick={handleExport}>
          <Download size={16} /> Export
        </button>
      </div>

      <div className="logs-layout">
        <aside className="logs-sidebar">
          <Card title="Filters">
            <LogsFilters filters={filters} onFiltersChange={handleFiltersChange} />
          </Card>
        </aside>

        <section className="logs-main">
          {error && (
            <ErrorDisplay
              title="Error loading logs"
              message={error}
              retry={fetchLogs}
            />
          )}

          {logs.length === 0 ? (
            <Empty
              title="No logs found"
              description="Logs will appear here when activities occur"
            />
          ) : (
            <Card title={`Logs (${logs.length})`}>
              <LogsTable logs={logs} isLoading={isLoading} />
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
