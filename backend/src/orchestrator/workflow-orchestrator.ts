import { Injectable } from '@nestjs/common';
import { EventBus } from '../analytics/event-bus';
import { FusedAdapterRegistry } from '../adapters/fused/fused-adapter.registry';
import { ExecutionContext } from '../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput } from '../common/interfaces/module.types';
import { WorkflowModule } from '../common/interfaces/workflow-module.interface';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { ModuleRegistry } from '../common/registry/module-registry';
import { ExecutionPlanBuilder } from './execution-plan-builder';
import { InputResolver } from './input-resolver';
import { WorkflowExecutionError } from './orchestrator.errors';
import { FusedAdapter, WorkflowExecutionResult } from './orchestrator.types';
import { WorkflowConfigService } from './workflow-config.service';
import { RetryExecutor } from './retry-executor';

@Injectable()
export class WorkflowOrchestrator {
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(
    private readonly executionPlanBuilder: ExecutionPlanBuilder,
    private readonly inputResolver: InputResolver,
    private readonly workflowConfigService: WorkflowConfigService,
    private readonly moduleRegistry: ModuleRegistry,
    private readonly fusedAdapterRegistry: FusedAdapterRegistry,
    private readonly retryExecutor: RetryExecutor,
    private readonly eventBus: EventBus,
    private readonly loggerFactory: AppLoggerService,
  ) {
    this.logger = this.loggerFactory.createLogger('workflow-orchestrator');
  }

  buildPlan(workflowId: string, workflowInput: ModuleInput, context: ExecutionContext) {
    context.workflowId = workflowId;
    context.workflowInput = workflowInput;
    return this.executionPlanBuilder.build(workflowId, workflowInput, context);
  }

  async execute(workflowId: string, workflowInput: ModuleInput, context: ExecutionContext): Promise<WorkflowExecutionResult> {
    context.workflowId = workflowId;
    context.workflowInput = workflowInput;

    const workflow = this.workflowConfigService.get(workflowId);
    const plan = this.executionPlanBuilder.build(workflowId, workflowInput, context);

    for (const step of plan.steps) {
      if (step.status === 'skipped') {
        if (step.defaultOutput && step.moduleIds.length === 1) {
          context.stepOutputs.set(step.moduleIds[0], step.defaultOutput);
        }
        continue;
      }

      try {
        if (step.type === 'module') {
          const workflowModule = this.moduleRegistry.get<WorkflowModule<ModuleInput, ModuleOutput>>(step.id);
          const input = this.inputResolver.resolve(step.id, workflow.inputMappings, workflowInput, context);
          const validationErrors = workflowModule.validateInputs(input);
          if (validationErrors.length > 0) {
            throw new WorkflowExecutionError(validationErrors[0].message, step.id);
          }

          const output = await this.retryExecutor.execute(
            () => workflowModule.execute(input, context),
            {
              attempts: workflow.maxRetries + 1,
              delayMs: workflow.retryDelayMs,
              timeoutMs: step.timeoutMs,
              stepId: step.id,
            },
          );
          context.stepOutputs.set(step.id, output);
          continue;
        }

        const fusedAdapter = this.fusedAdapterRegistry.get<FusedAdapter>(step.adapterId as string);
        const input = this.inputResolver.resolve(fusedAdapter.id, workflow.inputMappings, workflowInput, context);
        const validationErrors = fusedAdapter.validateInputs?.(input) ?? [];
        if (validationErrors.length > 0) {
          throw new WorkflowExecutionError(validationErrors[0].message, fusedAdapter.id);
        }

        const output = await this.retryExecutor.execute(
          () => fusedAdapter.execute(input, context),
          {
            attempts: workflow.maxRetries + 1,
            delayMs: workflow.retryDelayMs,
            timeoutMs: step.timeoutMs,
            stepId: fusedAdapter.id,
          },
        );
        const expandedOutputs = fusedAdapter.expandOutput(output);
        for (const [moduleId, moduleOutput] of Object.entries(expandedOutputs)) {
          context.stepOutputs.set(moduleId, moduleOutput);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown workflow execution error';
        this.logger.error('Workflow step failed', {
          workflowId,
          stepId: step.id,
          message,
        });
        this.eventBus.emit({
          type: 'workflow.failed',
          payload: {
            workflowId,
            stepId: step.id,
            message,
            correlationId: context.correlationId,
          },
        });

        if (step.required) {
          throw error;
        }
      }
    }

    return {
      workflowId,
      plan,
      stepOutputs: Object.fromEntries(context.stepOutputs.entries()),
    };
  }
}