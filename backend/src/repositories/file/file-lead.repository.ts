import { Injectable } from '@nestjs/common';
import { CrmDataStoreService } from '../../data/crm-data-store.service';
import { Lead, LeadStatus } from '../../common/models/lead.model';
import { LeadRepository } from '../lead.repository';

@Injectable()
export class FileLeadRepository implements LeadRepository {
  constructor(private readonly dataStore: CrmDataStoreService) {}

  async findAll(): Promise<Lead[]> {
    return this.dataStore.listLeads();
  }

  async findById(id: string): Promise<Lead | null> {
    return this.dataStore.getLeadById(id) ?? null;
  }

  async findByFunnelStage(funnelId: string, stageId: string): Promise<Lead[]> {
    return this.dataStore.getLeadsByFunnelStage(funnelId, stageId);
  }

  async updateStatus(leadId: string, status: LeadStatus): Promise<void> {
    this.dataStore.updateLeadStatus(leadId, status);
  }
}
