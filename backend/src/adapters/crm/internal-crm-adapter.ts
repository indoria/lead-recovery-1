import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { Customer } from '../../common/models/customer.model';
import { FunnelContext } from '../../common/models/funnel.model';
import { Lead, LeadStatus } from '../../common/models/lead.model';
import { CRMAdapter, LeadLookupAdapter } from './crm-adapter.interface';

interface InternalCRMPage<T> {
  data: T[];
  nextCursor?: string;
}

@Injectable()
export class InternalCRMAdapter implements CRMAdapter, LeadLookupAdapter {
  constructor(private readonly configService: AppConfigService) {}

  async getCustomerById(id: string): Promise<Customer> {
    return this.request<Customer>(`/customers/${encodeURIComponent(id)}`);
  }

  async getLeadById(id: string): Promise<Lead> {
    return this.request<Lead>(`/leads/${encodeURIComponent(id)}`);
  }

  async getLeadsByFunnelStage(funnelId: string, stageId: string): Promise<Lead[]> {
    const leads: Lead[] = [];
    let cursor: string | undefined;

    do {
      const query = new URLSearchParams({ funnelId, stageId, ...(cursor ? { cursor } : {}) });
      const page = await this.request<InternalCRMPage<Lead>>(`/leads?${query.toString()}`);
      leads.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);

    return leads;
  }

  async updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
    await this.request(`/leads/${encodeURIComponent(leadId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async getCustomerFunnelContext(customerId: string, funnelId: string): Promise<FunnelContext> {
    const query = new URLSearchParams({ customerId, funnelId });
    return this.request<FunnelContext>(`/funnel-context?${query.toString()}`);
  }

  private async request<T = unknown>(
    path: string,
    init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
  ): Promise<T> {
    const config = this.configService.getConfig().crm;
    const apiKey = process.env[config.apiKeyEnvVar] ?? process.env.CRM_API_KEY;
    const url = `${config.baseUrl}${path}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Internal CRM request failed: ${response.status}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}