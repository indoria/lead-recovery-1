import { Inject, Injectable } from '@nestjs/common';
import { CRMAdapter, LeadLookupAdapter } from './crm-adapter.interface';
import { Customer } from '../../common/models/customer.model';
import { FunnelContext } from '../../common/models/funnel.model';
import { Lead, LeadStatus } from '../../common/models/lead.model';
import {
  CUSTOMER_REPOSITORY,
  FUNNEL_CONTEXT_REPOSITORY,
  LEAD_REPOSITORY,
} from '../../repositories/repository.tokens';
import { CustomerRepository } from '../../repositories/customer.repository';
import { LeadRepository } from '../../repositories/lead.repository';
import { FunnelContextRepository } from '../../repositories/funnel-context.repository';


@Injectable()
export class MockCRMAdapter implements CRMAdapter, LeadLookupAdapter {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: CustomerRepository,
    @Inject(LEAD_REPOSITORY) private readonly leadRepository: LeadRepository,
    @Inject(FUNNEL_CONTEXT_REPOSITORY) private readonly funnelContextRepository: FunnelContextRepository,
  ) {}

  async getCustomerById(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new Error(`Customer not found: ${id}`);
    }
    return customer;
  }


  async getLeadById(id: string): Promise<Lead> {
    const lead = await this.leadRepository.findById(id);
    if (!lead) {
      throw new Error(`Lead not found: ${id}`);
    }
    return lead;
  }


  async getLeadsByFunnelStage(funnelId: string, stageId: string): Promise<Lead[]> {
    return this.leadRepository.findByFunnelStage(funnelId, stageId);
  }


  async updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
    await this.leadRepository.updateStatus(leadId, status);
  }

  async getCustomerFunnelContext(customerId: string, funnelId: string): Promise<FunnelContext> {
    const context = await this.funnelContextRepository.findByCustomerAndFunnel(customerId, funnelId);
    if (!context) {
      throw new Error(`Funnel context not found for customer ${customerId} and funnel ${funnelId}`);
    }
    return context;
  }
}