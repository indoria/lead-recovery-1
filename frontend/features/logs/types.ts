export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  agent?: string;
  callId?: string;
}

export interface LogFilter {
  search?: string;
  level?: string;
  source?: string;
  timeRange?: "last-hour" | "last-day" | "last-week" | "all";
  page?: number;
  pageSize?: number;
}

export interface LogsResponse {
  items: LogEntry[];
  total: number;
  hasMore: boolean;
}

export type LogActionType = "clear" | "export" | "pause-stream";
