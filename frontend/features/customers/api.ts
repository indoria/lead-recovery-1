import { apiClient } from "@/lib/api/client";
import type { Customer, CustomerListResponse, LeadUploadResponse, CustomerFilters } from "./types";

const BASE_URL = "/customers";

export function buildCustomersUrl(filters: CustomerFilters): string {
  const params = new URLSearchParams();

  if (filters.search) {
    params.append("search", filters.search);
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

export async function getCustomers(filters: CustomerFilters): Promise<Customer[]> {
  try {
    const url = buildCustomersUrl(filters);
    const response = await apiClient.get<CustomerListResponse>(url, {
      cache: "force-cache",
      next: { revalidate: 15 },
    });

    // Handle both direct array and wrapped response
    if (Array.isArray(response)) {
      return response;
    }

    return response.items || [];
  } catch (err) {
    console.error("Failed to fetch customers:", err);
    throw err;
  }
}

export async function getCustomerById(id: string): Promise<Customer> {
  return apiClient.get<Customer>(`${BASE_URL}/${id}`);
}

export async function uploadLeads(file: File): Promise<LeadUploadResponse> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/leads/import", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to upload leads");
    }

    return response.json();
  } catch (err) {
    console.error("Failed to upload leads:", err);
    throw err;
  }
}

export async function initiateCall(phone: string): Promise<{ ok: boolean }> {
  try {
    return await apiClient.post("/calls/manual", { phone });
  } catch (err) {
    console.error("Failed to initiate call:", err);
    throw err;
  }
}
