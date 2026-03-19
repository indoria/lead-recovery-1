"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { IntegrationsFilters, IntegrationsTable } from "@/features/integrations/components";
import {
  getIntegrations,
  testIntegrationConnection,
  reconnectIntegration,
} from "@/features/integrations/api";
import { logClientEvent } from "@/lib/telemetry/client";
import type { Integration, IntegrationFilter, IntegrationTest } from "@/features/integrations/types";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/ui/loading";
import { Empty } from "@/components/ui/empty";
import { ErrorDisplay } from "@/components/ui/error-display";

export default function IntegrationsPage() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [filters, setFilters] = useState<IntegrationFilter>({
    type: undefined,
    status: undefined,
    pageSize: 50,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, IntegrationTest>>({});

  // Fetch integrations
  const fetchIntegrations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getIntegrations(filters);
      setIntegrations(data);
      logClientEvent({
        type: "integrations_page_loaded",
        count: data.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load integrations";
      setError(message);
      logClientEvent({
        type: "integrations_page_error",
        error: message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Initial load
  useEffect(() => {
    fetchIntegrations();
  }, [filters]);

  const handleAction = useCallback(
    async (integrationId: string, action: string) => {
      try {
        setIsActionLoading(true);

        switch (action) {
          case "test-connection": {
            abortControllerRef.current = new AbortController();

            await testIntegrationConnection(
              integrationId,
              (test) => {
                setTestResults((prev) => ({
                  ...prev,
                  [integrationId]: test,
                }));
              },
              (result) => {
                setTestResults((prev) => ({
                  ...prev,
                  [integrationId]: result,
                }));

                if (result.status === "success") {
                  logClientEvent({
                    type: "integration_test_success",
                    integrationId,
                  });
                } else {
                  logClientEvent({
                    type: "integration_test_failed",
                    integrationId,
                    message: result.message,
                  });
                }
              },
              abortControllerRef.current.signal
            );
            break;
          }

          case "reconnect": {
            const updated = await reconnectIntegration(integrationId);
            setIntegrations((prev) =>
              prev.map((i) => (i.id === integrationId ? updated : i))
            );

            logClientEvent({
              type: "integration_reconnected",
              integrationId,
              newStatus: updated.status,
            });
            break;
          }

          default:
            console.warn(`Unknown action: ${action}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed";
        setError(message);
        logClientEvent({
          type: "integration_action_error",
          integrationId,
          action,
          error: message,
        });
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  const handleFiltersChange = useCallback((newFilters: IntegrationFilter) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  if (isLoading && integrations.length === 0) {
    return <PageLoading />;
  }

  if (error && integrations.length === 0) {
    return (
      <div className="integrations-page">
        <h1>Integrations</h1>
        <ErrorDisplay
          title="Failed to load integrations"
          message={error}
          retry={fetchIntegrations}
        />
      </div>
    );
  }

  return (
    <div className="integrations-page">
      <div className="integrations-header">
        <h1>Integrations</h1>
        <p className="integrations-subtitle">{integrations.length} integrations configured</p>
      </div>

      <div className="integrations-layout">
        <aside className="integrations-sidebar">
          <Card title="Filters">
            <IntegrationsFilters filters={filters} onFiltersChange={handleFiltersChange} />
          </Card>
        </aside>

        <section className="integrations-main">
          {error && (
            <div className="integrations-error" role="alert">
              <strong>Warning:</strong> {error}
            </div>
          )}

          {integrations.length === 0 ? (
            <Empty
              title="No integrations found"
              description="Configure integrations to enhance your system capabilities"
            />
          ) : (
            <Card title={`Integrations (${integrations.length})`}>
              <IntegrationsTable
                integrations={integrations}
                isLoading={isActionLoading}
                onAction={handleAction}
              />

              {Object.keys(testResults).length > 0 && (
                <div className="integration-tests-log">
                  <h3>Test Results</h3>
                  <ul>
                    {Object.entries(testResults).map(([integrationId, result]) => (
                      <li key={integrationId} className={`test-result test-result-${result.status}`}>
                        <span>{integrations.find((i) => i.id === integrationId)?.name}</span>
                        <span className={`status status-${result.status}`}>{result.status}</span>
                        {result.message && <span className="message">{result.message}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
