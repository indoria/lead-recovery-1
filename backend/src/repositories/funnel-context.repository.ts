import { FunnelContext } from '../common/models/funnel.model';

export interface FunnelContextRepository {
  findByCustomerAndFunnel(customerId: string, funnelId: string): Promise<FunnelContext | null>;
}
