import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Funnel } from '../common/models/funnel.model';
import { FunnelRepository } from '../repositories/funnel.repository';
import { FUNNEL_REPOSITORY } from '../repositories/repository.tokens';

@Injectable()
export class FunnelsService {
  constructor(@Inject(FUNNEL_REPOSITORY) private readonly funnelRepository: FunnelRepository) {}

  async list(): Promise<Funnel[]> {
    return this.funnelRepository.findAll();
  }

  async update(id: string, patch: Partial<Funnel>): Promise<Funnel> {
    const updated = await this.funnelRepository.update(id, sanitizePatch(patch));
    if (!updated) {
      throw new NotFoundException(`Funnel not found: ${id}`);
    }
    return updated;
  }
}

function sanitizePatch(input: Partial<Funnel>): Partial<Funnel> {
  const patch = { ...input };
  delete patch.id;
  return patch;
}
