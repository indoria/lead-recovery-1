import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '../../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput } from '../../common/interfaces/module.types';
import { Customer } from '../../common/models/customer.model';
import { FunnelContext } from '../../common/models/funnel.model';
import { Lead } from '../../common/models/lead.model';
import { CustomerContextAcquisitionService } from '../../modules/customer-context-acquisition/customer-context-acquisition.service';
import { CustomerDataRetrievalService } from '../../modules/customer-data-retrieval/customer-data-retrieval.service';
import { FusedAdapter } from '../../orchestrator/orchestrator.types';

interface CRMContextFusedInput extends ModuleInput {
  leadId: string;
}

interface CRMContextFusedOutput extends ModuleOutput {
  customer: Customer;
  lead: Lead;
  funnelContext: FunnelContext;
}

@Injectable()
export class CRMContextFusedAdapter implements FusedAdapter<CRMContextFusedInput, CRMContextFusedOutput> {
  readonly id = 'crm-context-fused-adapter';
  readonly type = 'crm-context-fused';
  readonly fusesModuleIds = ['customer-data-retrieval', 'customer-context-acquisition'];

  constructor(
    private readonly dataRetrievalService: CustomerDataRetrievalService,
    private readonly contextAcquisitionService: CustomerContextAcquisitionService,
  ) {}

  async execute(input: CRMContextFusedInput, context: ExecutionContext): Promise<CRMContextFusedOutput> {
    const retrieval = await this.dataRetrievalService.execute({ leadId: input.leadId }, context);
    const contextOutput = await this.contextAcquisitionService.execute(
      {
        customerId: retrieval.customer.id,
        funnelId: retrieval.lead.funnelId,
      },
      context,
    );

    return {
      customer: retrieval.customer,
      lead: retrieval.lead,
      funnelContext: contextOutput.funnelContext,
    };
  }

  expandOutput(output: CRMContextFusedOutput): Record<string, ModuleOutput> {
    return {
      'customer-data-retrieval': {
        customer: output.customer,
        lead: output.lead,
      },
      'customer-context-acquisition': {
        funnelContext: output.funnelContext,
      },
    };
  }
}