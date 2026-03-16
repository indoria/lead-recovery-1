import { Funnel } from '../common/models/funnel.model';

export interface FunnelRepository {
  findAll(): Promise<Funnel[]>;
  findById(id: string): Promise<Funnel | null>;
  update(id: string, patch: Partial<Funnel>): Promise<Funnel | null>;
}
