"use client";

import { useMemo } from "react";
import type { LogEntry } from "../types";

export function LogLevelBadge({ level }: { level: string }) {
  const levelConfig: Record<string, { bg: string; text: string }> = {
    debug: { bg: "bg-gray-100", text: "text-gray-700" },
    info: { bg: "bg-blue-100", text: "text-blue-700" },
    warn: { bg: "bg-yellow-100", text: "text-yellow-700" },
    error: { bg: "bg-red-100", text: "text-red-700" },
  };

  const config = levelConfig[level] || levelConfig.info;

  return (
    <span className={`badge badge-sm ${config.bg} ${config.text}`}>
      {level.toUpperCase()}
    </span>
  );
}

export function LogSourceBadge({ source }: { source: string }) {
  const sourceColors: Record<string, string> = {
    frontend: "bg-purple-100 text-purple-700",
    backend: "bg-green-100 text-green-700",
    stream: "bg-cyan-100 text-cyan-700",
    telephony: "bg-orange-100 text-orange-700",
    agent: "bg-pink-100 text-pink-700",
  };

  const className = sourceColors[source] || "bg-gray-100 text-gray-700";

  return <span className={`badge badge-sm ${className}`}>{source}</span>;
}

export function LogsFilters({
  filters,
  onFiltersChange,
}: {
  filters: { level?: string; source?: string; timeRange?: string };
  onFiltersChange: (filters: any) => void;
}) {
  return (
    <div className="logs-filters">
      <div className="field-group">
        <label className="field-label">Level</label>
        <select
          className="field-input"
          value={filters.level || "all"}
          onChange={(e) => onFiltersChange({ ...filters, level: e.target.value })}
        >
          <option value="all">All</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>

      <div className="field-group">
        <label className="field-label">Source</label>
        <select
          className="field-input"
          value={filters.source || "all"}
          onChange={(e) => onFiltersChange({ ...filters, source: e.target.value })}
        >
          <option value="all">All</option>
          <option value="frontend">Frontend</option>
          <option value="backend">Backend</option>
          <option value="stream">Stream</option>
          <option value="telephony">Telephony</option>
          <option value="agent">Agent</option>
        </select>
      </div>

      <div className="field-group">
        <label className="field-label">Time Range</label>
        <select
          className="field-input"
          value={filters.timeRange || "last-hour"}
          onChange={(e) => onFiltersChange({ ...filters, timeRange: e.target.value })}
        >
          <option value="last-hour">Last Hour</option>
          <option value="last-day">Last Day</option>
          <option value="last-week">Last Week</option>
          <option value="all">All Time</option>
        </select>
      </div>
    </div>
  );
}

export function LogsTable({ logs, isLoading }: { logs: LogEntry[]; isLoading: boolean }) {
  return (
    <div className="logs-table">
      <table className="table table-striped">
        <thead>
          <tr>
            <th scope="col">Timestamp</th>
            <th scope="col">Level</th>
            <th scope="col">Source</th>
            <th scope="col">Agent</th>
            <th scope="col">Message</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className={isLoading ? "opacity-50" : ""}>
              <td className="text-xs text-muted">
                {new Date(log.timestamp).toLocaleTimeString()}
              </td>
              <td>
                <LogLevelBadge level={log.level} />
              </td>
              <td>
                <LogSourceBadge source={log.source} />
              </td>
              <td className="text-sm">{log.agent || "—"}</td>
              <td className="text-sm">{log.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
