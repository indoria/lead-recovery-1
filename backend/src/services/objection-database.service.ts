import { Inject, Injectable } from '@nestjs/common';
import { Objection } from '../common/models/funnel.model';
import { FunnelRepository } from '../repositories/funnel.repository';
import { FUNNEL_REPOSITORY } from '../repositories/repository.tokens';

@Injectable()
export class ObjectionDatabaseService {
  constructor(@Inject(FUNNEL_REPOSITORY) private readonly funnelRepository: FunnelRepository) {}

  async getForStage(funnelId: string, stageId: string): Promise<Objection[]> {
    const funnel = await this.funnelRepository.findById(funnelId);
    if (!funnel) {
      return [];
    }
    const stage = funnel.stages.find((entry) => entry.id === stageId);
    if (!stage) {
      return [];
    }
    return [...stage.customerObjections, ...stage.systemObjections].map((entry) => ({ ...entry }));
  }
}
