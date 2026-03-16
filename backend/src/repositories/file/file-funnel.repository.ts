import { Injectable } from '@nestjs/common';
import { Funnel } from '../../common/models/funnel.model';
import { CrmDataStoreService } from '../../data/crm-data-store.service';
import { FunnelRepository } from '../funnel.repository';

@Injectable()
export class FileFunnelRepository implements FunnelRepository {
  constructor(private readonly dataStore: CrmDataStoreService) {}

  async findAll(): Promise<Funnel[]> {
    return this.dataStore.listFunnels();
  }

  async findById(id: string): Promise<Funnel | null> {
    return this.dataStore.getFunnelById(id) ?? null;
  }

  async update(id: string, patch: Partial<Funnel>): Promise<Funnel | null> {
    const existing = this.dataStore.getFunnelById(id);
    if (!existing) {
      return null;
    }

    const updated: Funnel = {
      ...existing,
      ...patch,
      id: existing.id,
      stages: Array.isArray(patch.stages) ? patch.stages : existing.stages,
      policies: Array.isArray(patch.policies) ? patch.policies : existing.policies,
    };

    return this.dataStore.updateFunnel(id, updated) ?? null;
  }
}
