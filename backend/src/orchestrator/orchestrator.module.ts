import { Module } from '@nestjs/common';
import { FusedAdaptersModule } from '../adapters/fused/fused-adapters.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ModuleRegistryModule } from '../common/registry/module-registry.module';
import { ConditionEvaluator } from './condition-evaluator';
import { ExecutionPlanBuilder } from './execution-plan-builder';
import { FusionEngine } from './fusion-engine';
import { InputResolver } from './input-resolver';
import { RetryExecutor } from './retry-executor';
import { WorkflowConfigService } from './workflow-config.service';
import { WorkflowOrchestrator } from './workflow-orchestrator';

@Module({
  imports: [ModuleRegistryModule, FusedAdaptersModule, AnalyticsModule],
  providers: [
    ConditionEvaluator,
    WorkflowConfigService,
    InputResolver,
    RetryExecutor,
    FusionEngine,
    ExecutionPlanBuilder,
    WorkflowOrchestrator,
  ],
  exports: [WorkflowConfigService, ExecutionPlanBuilder, WorkflowOrchestrator],
})
export class OrchestratorModule {}