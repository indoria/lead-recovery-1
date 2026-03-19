import { apiClient } from "@/lib/api/client";
import type { Integration, IntegrationFilter, IntegrationsResponse, IntegrationTest } from "./types";
import { logClientEvent } from "@/lib/telemetry/client";

const BASE_URL = "/integrations";

export function buildIntegrationsUrl(filters: IntegrationFilter): string {
  const params = new URLSearchParams();

  if (filters.search) {
    params.append("search", filters.search);
  }
  if (filters.type && filters.type !== "all") {
    params.append("type", filters.type);
  }
  if (filters.status && filters.status !== "all") {
    params.append("status", filters.status);
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

export async function getIntegrations(filters: IntegrationFilter): Promise<Integration[]> {
  try {
    const url = buildIntegrationsUrl(filters);
    const response = await apiClient.get<IntegrationsResponse>(url);

    logClientEvent({
      type: "integrations_fetched",
      count: response.items?.length || 0,
    });

    return response.items || [];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch integrations";
    logClientEvent({
      type: "integrations_fetch_error",
      error: message,
    });
    throw err;
  }
}

export async function getIntegrationById(id: string): Promise<Integration> {
  try {
    return await apiClient.get<Integration>(`${BASE_URL}/${id}`);
  } catch (err) {
    logClientEvent({
      type: "integration_fetch_error",
      integrationId: id,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

/**
 * Test connection to a specific integration
 * Streams test progress via polling
 */
export async function testIntegrationConnection(
  integrationId: string,
  onProgress: (test: IntegrationTest) => void,
  onComplete: (result: IntegrationTest) => void,
  abortSignal: AbortSignal
): Promise<void> {
  try {
    logClientEvent({
      type: "integration_test_started",
      integrationId,
    });

    // Start the test
    const testResponse = await apiClient.post<IntegrationTest>(
      `${BASE_URL}/${integrationId}/test`,
      {}
    );

    let testResult = testResponse;
    let pollCount = 0;
    const maxPolls = 30; // 30 seconds with 1s interval

    // Poll for test completion
    while (testResult.status === "pending" || testResult.status === "testing") {
      onProgress(testResult);

      if (pollCount >= maxPolls) {
        logClientEvent({
          type: "integration_test_timeout",
          integrationId,
        });
        throw new Error("Integration test timed out");
      }

      if (abortSignal.aborted) {
        logClientEvent({
          type: "integration_test_cancelled",
          integrationId,
        });
        throw new Error("Integration test cancelled");
      }

      // Wait 1 second before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));

      testResult = await apiClient.get<IntegrationTest>(
        `${BASE_URL}/${integrationId}/test/${testResponse.id}`
      );

      pollCount++;
    }

    onComplete(testResult);

    logClientEvent({
      type: "integration_test_completed",
      integrationId,
      status: testResult.status,
      message: testResult.message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test failed";
    logClientEvent({
      type: "integration_test_error",
      integrationId,
      error: message,
    });
    throw err;
  }
}

export async function reconnectIntegration(integrationId: string): Promise<Integration> {
  try {
    logClientEvent({
      type: "integration_reconnect_started",
      integrationId,
    });

    const result = await apiClient.post<Integration>(
      `${BASE_URL}/${integrationId}/reconnect`,
      {}
    );

    logClientEvent({
      type: "integration_reconnect_completed",
      integrationId,
      status: result.status,
    });

    return result;
  } catch (err) {
    logClientEvent({
      type: "integration_reconnect_error",
      integrationId,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

export async function disconnectIntegration(integrationId: string): Promise<void> {
  try {
    await apiClient.post(`${BASE_URL}/${integrationId}/disconnect`, {});

    logClientEvent({
      type: "integration_disconnected",
      integrationId,
    });
  } catch (err) {
    logClientEvent({
      type: "integration_disconnect_error",
      integrationId,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
