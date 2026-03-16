import { Lead, LeadStatus } from '../common/models/lead.model';

export interface LeadRepository {
  findAll(): Promise<Lead[]>;
  findById(id: string): Promise<Lead | null>;
  findByFunnelStage(funnelId: string, stageId: string): Promise<Lead[]>;
  updateStatus(leadId: string, status: LeadStatus): Promise<void>;
}
