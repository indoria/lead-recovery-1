import { Injectable } from '@nestjs/common';
import { FunnelContext } from '../../common/models/funnel.model';
import { CrmDataStoreService } from '../../data/crm-data-store.service';
import { FunnelContextRepository } from '../funnel-context.repository';

@Injectable()
export class FileFunnelContextRepository implements FunnelContextRepository {
  constructor(private readonly dataStore: CrmDataStoreService) {}

  async findByCustomerAndFunnel(customerId: string, funnelId: string): Promise<FunnelContext | null> {
    return this.dataStore.getFunnelContext(customerId, funnelId) ?? null;
  }
}
