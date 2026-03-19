"use client";

import { AlertTriangle, AlertCircle, CheckCircle, Loader } from "lucide-react";

export function IntegrationStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    connected: { bg: "bg-green-100", text: "text-green-700", icon: <CheckCircle size={14} /> },
    disconnected: { bg: "bg-gray-100", text: "text-gray-700", icon: <AlertCircle size={14} /> },
    error: { bg: "bg-red-100", text: "text-red-700", icon: <AlertTriangle size={14} /> },
    pending: { bg: "bg-yellow-100", text: "text-yellow-700", icon: <Loader size={14} /> },
  };

  const config = statusConfig[status] || statusConfig.disconnected;

  return (
    <span className={`badge badge-sm ${config.bg} ${config.text}`}>
      {config.icon} {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function IntegrationTypeTag({ type }: { type: string }) {
  const typeColors: Record<string, string> = {
    telephony: "bg-blue-100 text-blue-700",
    crm: "bg-green-100 text-green-700",
    analytics: "bg-purple-100 text-purple-700",
    ai: "bg-pink-100 text-pink-700",
    api: "bg-gray-100 text-gray-700",
  };

  return (
    <span className={`badge badge-sm ${typeColors[type] || typeColors.api}`}>
      {type.toUpperCase()}
    </span>
  );
}

export function IntegrationsFilters({
  filters,
  onFiltersChange,
}: {
  filters: { type?: string; status?: string };
  onFiltersChange: (filters: any) => void;
}) {
  return (
    <div className="integrations-filters">
      <div className="field-group">
        <label className="field-label">Type</label>
        <select
          className="field-input"
          value={filters.type || "all"}
          onChange={(e) => onFiltersChange({ ...filters, type: e.target.value })}
        >
          <option value="all">All Types</option>
          <option value="telephony">Telephony</option>
          <option value="crm">CRM</option>
          <option value="analytics">Analytics</option>
          <option value="ai">AI</option>
          <option value="api">API</option>
        </select>
      </div>

      <div className="field-group">
        <label className="field-label">Status</label>
        <select
          className="field-input"
          value={filters.status || "all"}
          onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
        >
          <option value="all">All Statuses</option>
          <option value="connected">Connected</option>
          <option value="disconnected">Disconnected</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>
      </div>
    </div>
  );
}

export function IntegrationsTable({
  integrations,
  isLoading,
  onAction,
}: {
  integrations: any[];
  isLoading: boolean;
  onAction: (integrationId: string, action: string) => void;
}) {
  return (
    <div className="integrations-table">
      <table className="table table-striped">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Provider</th>
            <th scope="col">Last Sync</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {integrations.map((integration) => (
            <tr key={integration.id} className={isLoading ? "opacity-50" : ""}>
              <td className="font-medium">{integration.name}</td>
              <td>
                <IntegrationTypeTag type={integration.type} />
              </td>
              <td>
                <IntegrationStatusBadge status={integration.status} />
              </td>
              <td className="text-sm">{integration.provider || "—"}</td>
              <td className="text-xs text-muted">
                {integration.lastSync ? new Date(integration.lastSync).toLocaleString() : "—"}
              </td>
              <td>
                <div className="action-buttons">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onAction(integration.id, "test-connection")}
                    disabled={isLoading}
                  >
                    Test
                  </button>
                  {integration.status === "disconnected" && (
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => onAction(integration.id, "reconnect")}
                      disabled={isLoading}
                    >
                      Reconnect
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
