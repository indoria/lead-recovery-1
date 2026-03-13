import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '../common/interfaces/execution-context.interface';
import { WorkflowModule } from '../common/interfaces/workflow-module.interface';
import { ModuleRegistry } from '../common/registry/module-registry';
import { FusedAdapterRegistry } from '../adapters/fused/fused-adapter.registry';
import { ConditionEvaluator } from './condition-evaluator';
import { WorkflowPlanError } from './orchestrator.errors';
import { ExecutionPlan, FusedAdapter, FusionRule, PlannedStep, StepConfig, WorkflowDefinition } from './orchestrator.types';

@Injectable()
export class FusionEngine {
  constructor(
    private readonly moduleRegistry: ModuleRegistry,
    private readonly fusedAdapterRegistry: FusedAdapterRegistry,
    private readonly conditionEvaluator: ConditionEvaluator,
  ) {}

  buildPlan(
    workflow: WorkflowDefinition,
    context: ExecutionContext,
    workflowInput: Record<string, unknown>,
  ): ExecutionPlan {
    const orderedSteps = [...workflow.steps].sort((left, right) => left.order - right.order);
    const activeRules = workflow.fusionRules.filter((rule) => this.isFusionRuleActive(rule, orderedSteps, context, workflowInput));
    const coveredModuleIds = new Set<string>();
    const planSteps: PlannedStep[] = [];

    for (const step of orderedSteps) {
      if (coveredModuleIds.has(step.moduleId)) {
        continue;
      }

      const fusionRule = activeRules.find((rule) => rule.moduleIds[0] === step.moduleId);
      if (fusionRule) {
        for (const moduleId of fusionRule.moduleIds) {
          coveredModuleIds.add(moduleId);
        }

        const fusedAdapter = this.fusedAdapterRegistry.get<FusedAdapter>(fusionRule.fusedAdapterId);
        planSteps.push({
          id: fusionRule.id,
          type: 'fused',
          order: step.order,
          moduleIds: [...fusionRule.moduleIds],
          required: orderedSteps.filter((entry) => fusionRule.moduleIds.includes(entry.moduleId)).some((entry) => entry.required),
          timeoutMs: Math.max(...orderedSteps.filter((entry) => fusionRule.moduleIds.includes(entry.moduleId)).map((entry) => entry.timeoutMs)),
          adapterId: fusedAdapter.id,
          adapterType: fusedAdapter.type,
          status: 'planned',
        });
        continue;
      }

      const workflowModule = this.moduleRegistry.get<WorkflowModule<Record<string, unknown>, Record<string, unknown>>>(step.moduleId);
      const shouldSkip = this.shouldSkipStep(step, workflowModule, context, workflowInput);
      if (shouldSkip.status === 'skipped' && step.required) {
        throw new WorkflowPlanError(`Required step cannot be skipped: ${step.moduleId}`);
      }

      planSteps.push({
        id: step.moduleId,
        type: 'module',
        order: step.order,
        moduleIds: [step.moduleId],
        required: step.required,
        timeoutMs: step.timeoutMs,
        status: shouldSkip.status,
        reason: shouldSkip.reason,
        defaultOutput: shouldSkip.defaultOutput,
      });
    }

    return {
      workflowId: workflow.workflowId,
      steps: planSteps,
      activeFusionRuleIds: activeRules.map((rule) => rule.id),
    };
  }

  private shouldSkipStep(
    step: StepConfig,
    workflowModule: WorkflowModule<Record<string, unknown>, Record<string, unknown>>,
    context: ExecutionContext,
    workflowInput: Record<string, unknown>,
  ): { status: 'planned' | 'skipped'; reason?: string; defaultOutput?: Record<string, unknown> } {
    const skipCondition = (step.skipConditions ?? []).find((condition) =>
      this.conditionEvaluator.evaluate(condition.expression, this.createConditionScope(context, workflowInput)),
    );

    if (!skipCondition && !workflowModule.canSkip(context)) {
      return { status: 'planned' };
    }

    if (step.required) {
      return { status: 'planned' };
    }

    return {
      status: 'skipped',
      reason: skipCondition?.expression ?? 'module.canSkip returned true',
      defaultOutput: skipCondition?.defaultOutput,
    };
  }

  private isFusionRuleActive(
    rule: FusionRule,
    orderedSteps: StepConfig[],
    context: ExecutionContext,
    workflowInput: Record<string, unknown>,
  ): boolean {
    const stepIndexes = rule.moduleIds.map((moduleId) => orderedSteps.findIndex((step) => step.moduleId === moduleId));
    if (stepIndexes.some((index) => index < 0)) {
      return false;
    }

    for (let index = 1; index < stepIndexes.length; index += 1) {
      if (stepIndexes[index] !== stepIndexes[index - 1] + 1) {
        return false;
      }
    }

    if (!this.fusedAdapterRegistry.has(rule.fusedAdapterId)) {
      throw new WorkflowPlanError(`Fused adapter not found: ${rule.fusedAdapterId}`);
    }

    if (rule.moduleIds.length === 2) {
      const [first, second] = rule.moduleIds;
      const firstModule = this.moduleRegistry.get<WorkflowModule<Record<string, unknown>, Record<string, unknown>>>(first);
      const secondModule = this.moduleRegistry.get<WorkflowModule<Record<string, unknown>, Record<string, unknown>>>(second);
      if (!firstModule.isFusable(second) && !secondModule.isFusable(first)) {
        return false;
      }
    }

    return this.conditionEvaluator.evaluate(rule.condition, this.createConditionScope(context, workflowInput));
  }

  private createConditionScope(
    context: ExecutionContext,
    workflowInput: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      config: context.config,
      crm: context.config.crm,
      telephony: context.config.telephony,
      llm: context.config.llm,
      conversationalAi: context.config.conversationalAi,
      workflowInput,
    };
  }
}