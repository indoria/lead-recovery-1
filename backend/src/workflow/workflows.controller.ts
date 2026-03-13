import { BadRequestException, Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { FusedAdapterRegistry } from '../adapters/fused/fused-adapter.registry';
import { AppConfigService } from '../common/config/app-config.service';
import { ExecutionContext } from '../common/interfaces/execution-context.interface';
import { ModuleInput } from '../common/interfaces/module.types';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { CorrelationIdService } from '../common/logger/correlation-id.service';
import { ModuleRegistry } from '../common/registry/module-registry';
import { WorkflowPlanError } from '../orchestrator/orchestrator.errors';
import { WorkflowConfigService } from '../orchestrator/workflow-config.service';
import { WorkflowOrchestrator } from '../orchestrator/workflow-orchestrator';

@Controller()
export class WorkflowsController {
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(
    private readonly workflowConfigService: WorkflowConfigService,
    private readonly workflowOrchestrator: WorkflowOrchestrator,
    private readonly moduleRegistry: ModuleRegistry,
    private readonly fusedAdapterRegistry: FusedAdapterRegistry,
    private readonly configService: AppConfigService,
    private readonly loggerFactory: AppLoggerService,
    private readonly correlationIdService: CorrelationIdService,
  ) {
    this.logger = this.loggerFactory.createLogger('workflows-api');
  }

  @Get('workflows')
  listWorkflows(): { workflows: Array<{ workflowId: string; stepCount: number; fusionRuleCount: number }> } {
    return {
      workflows: this.workflowConfigService.list().map((workflow) => ({
        workflowId: workflow.workflowId,
        stepCount: workflow.steps.length,
        fusionRuleCount: workflow.fusionRules.length,
      })),
    };
  }

  @Get('workflows/:id')
  getWorkflow(@Param('id') workflowId: string) {
    try {
      return { workflow: this.workflowConfigService.get(workflowId) };
    } catch (error) {
      if (error instanceof WorkflowPlanError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get('workflows/:id/plan')
  getWorkflowPlan(@Param('id') workflowId: string) {
    try {
      const plan = this.workflowOrchestrator.buildPlan(
        workflowId,
        {},
        this.createExecutionContext({}),
      );
      return { plan };
    } catch (error) {
      if (error instanceof WorkflowPlanError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get('adapters')
  getAdapters(): {
    workflowModules: Array<{ id: string; tags: string[] }>;
    fusedAdapters: Array<{ id: string; fusesModuleIds: string[]; type: string }>;
  } {
    return {
      workflowModules: this.moduleRegistry.list('workflow'),
      fusedAdapters: this.fusedAdapterRegistry.list().map((entry) => {
        const adapter = this.fusedAdapterRegistry.get(entry.id);
        return {
          id: entry.id,
          fusesModuleIds: [...adapter.fusesModuleIds],
          type: adapter.type,
        };
      }),
    };
  }

  @Get('fusions')
  getFusions(): {
    workflows: Array<{ workflowId: string; activeFusionRuleIds: string[]; configuredFusionRuleIds: string[] }>;
  } {
    const workflows = this.workflowConfigService.list().map((workflow) => {
      const plan = this.workflowOrchestrator.buildPlan(workflow.workflowId, {}, this.createExecutionContext({}));
      return {
        workflowId: workflow.workflowId,
        activeFusionRuleIds: plan.activeFusionRuleIds,
        configuredFusionRuleIds: workflow.fusionRules.map((rule) => rule.id),
      };
    });

    this.logger.info('Workflow fusion state inspected', { workflowCount: workflows.length });
    return { workflows };
  }

  private createExecutionContext(input: ModuleInput): ExecutionContext {
    return {
      correlationId: this.correlationIdService.getCorrelationId() ?? crypto.randomUUID(),
      customerId: '',
      funnelId: '',
      stageId: 'phase-3-stage',
      config: this.configService.getConfig(),
      logger: this.logger,
      stepOutputs: new Map(),
      workflowInput: input,
    };
  }
}