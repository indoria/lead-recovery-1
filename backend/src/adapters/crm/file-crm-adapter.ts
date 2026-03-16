import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { MockCRMAdapter } from './mock-crm-adapter';
import {
  CUSTOMER_REPOSITORY,
  FUNNEL_CONTEXT_REPOSITORY,
  LEAD_REPOSITORY,
} from '../../repositories/repository.tokens';
import { CustomerRepository } from '../../repositories/customer.repository';
import { LeadRepository } from '../../repositories/lead.repository';
import { FunnelContextRepository } from '../../repositories/funnel-context.repository';

// Reuses repository-backed logic; selected via crm.adapter=file for clarity.
@Injectable()
export class FileCRMAdapter extends MockCRMAdapter {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) customerRepository: CustomerRepository,
    @Inject(LEAD_REPOSITORY) leadRepository: LeadRepository,
    @Inject(FUNNEL_CONTEXT_REPOSITORY) funnelContextRepository: FunnelContextRepository,
  ) {
    super(customerRepository, leadRepository, funnelContextRepository);
  }
}
