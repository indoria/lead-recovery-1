import { Module } from '@nestjs/common';
import { FusedAdaptersModule } from '../adapters/fused/fused-adapters.module';
import { ModuleRegistryModule } from '../common/registry/module-registry.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { WorkflowController } from './workflow.controller';
import { WorkflowsController } from './workflows.controller';

@Module({
  imports: [ModuleRegistryModule, OrchestratorModule, FusedAdaptersModule],
  controllers: [WorkflowController, WorkflowsController],
})
export class WorkflowModule {}
