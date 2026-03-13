import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '../common/interfaces/execution-context.interface';
import { ModuleInput } from '../common/interfaces/module.types';
import { FusionEngine } from './fusion-engine';
import { ExecutionPlan } from './orchestrator.types';
import { WorkflowConfigService } from './workflow-config.service';

@Injectable()
export class ExecutionPlanBuilder {
  constructor(
    private readonly workflowConfigService: WorkflowConfigService,
    private readonly fusionEngine: FusionEngine,
  ) {}

  build(workflowId: string, workflowInput: ModuleInput, context: ExecutionContext): ExecutionPlan {
    const workflow = this.workflowConfigService.get(workflowId);
    return this.fusionEngine.buildPlan(workflow, context, workflowInput);
  }
}