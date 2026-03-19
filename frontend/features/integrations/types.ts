export interface Integration {
  id: string;
  name?: string;
  type: "telephony" | "crm" | "analytics" | "ai" | "api";
  status: "connected" | "disconnected" | "error" | "pending";
  provider?: string;
  lastSync?: string;
  config?: Record<string, unknown>;
}

export interface IntegrationTest {
  id: string;
  integrationId: string;
  status: "pending" | "testing" | "success" | "failed";
  message?: string;
  timestamp: string;
}

export interface IntegrationFilter {
  search?: string;
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface IntegrationsResponse {
  items: Integration[];
  total: number;
}

export type IntegrationActionType = "test-connection" | "reconnect" | "configure" | "disconnect";
