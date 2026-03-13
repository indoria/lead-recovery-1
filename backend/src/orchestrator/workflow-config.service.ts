import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { WorkflowPlanError } from './orchestrator.errors';
import { FusionRule, ModuleInputMapping, StepConfig, WorkflowDefinition } from './orchestrator.types';

type WorkflowFile = Partial<WorkflowDefinition> & Record<string, unknown>;

@Injectable()
export class WorkflowConfigService {
  private readonly workflows = new Map<string, WorkflowDefinition>();

  constructor() {
    for (const workflow of this.loadAll()) {
      this.workflows.set(workflow.workflowId, workflow);
    }
  }

  list(): WorkflowDefinition[] {
    return [...this.workflows.values()].map((workflow) => structuredClone(workflow));
  }

  get(workflowId: string): WorkflowDefinition {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowPlanError(`Workflow config not found: ${workflowId}`);
    }

    return structuredClone(workflow);
  }

  private loadAll(): WorkflowDefinition[] {
    const directoryPath = join(process.cwd(), 'config', 'workflows');
    if (!existsSync(directoryPath)) {
      return [];
    }

    return readdirSync(directoryPath)
      .filter((entry) => entry.endsWith('.yaml') || entry.endsWith('.yml'))
      .map((entry) => this.validateWorkflow(yaml.load(readFileSync(join(directoryPath, entry), 'utf8')) as WorkflowFile));
  }

  private validateWorkflow(file: WorkflowFile): WorkflowDefinition {
    if (typeof file.workflowId !== 'string' || file.workflowId.trim().length === 0) {
      throw new WorkflowPlanError('workflowId is required in workflow config');
    }
    const workflowId = file.workflowId;

    if (!Array.isArray(file.steps) || file.steps.length === 0) {
      throw new WorkflowPlanError(`Workflow ${workflowId} must declare steps`);
    }

    if (!Array.isArray(file.inputMappings) || file.inputMappings.length === 0) {
      throw new WorkflowPlanError(`Workflow ${workflowId} must declare inputMappings`);
    }

    return {
      workflowId,
      steps: file.steps.map((step) => this.validateStep(step, workflowId)),
      fusionRules: Array.isArray(file.fusionRules)
        ? file.fusionRules.map((rule) => this.validateFusionRule(rule, workflowId))
        : [],
      inputMappings: file.inputMappings.map((mapping) => this.validateInputMapping(mapping, workflowId)),
      maxRetries: this.readPositiveInteger(file.maxRetries, `${workflowId}.maxRetries`, 0),
      retryDelayMs: this.readPositiveInteger(file.retryDelayMs, `${workflowId}.retryDelayMs`, 0),
    };
  }

  private validateStep(step: unknown, workflowId: string): StepConfig {
    if (!this.isRecord(step) || typeof step.moduleId !== 'string') {
      throw new WorkflowPlanError(`Workflow ${workflowId} has an invalid step definition`);
    }

    return {
      moduleId: step.moduleId,
      order: this.readPositiveInteger(step.order, `${workflowId}.${step.moduleId}.order`),
      required: Boolean(step.required),
      timeoutMs: this.readPositiveInteger(step.timeoutMs, `${workflowId}.${step.moduleId}.timeoutMs`),
      skipConditions: Array.isArray(step.skipConditions)
        ? step.skipConditions.map((condition) => {
            if (!this.isRecord(condition) || typeof condition.expression !== 'string') {
              throw new WorkflowPlanError(`Workflow ${workflowId} has an invalid skip condition for ${step.moduleId}`);
            }

            return {
              moduleId: typeof condition.moduleId === 'string' ? condition.moduleId : undefined,
              expression: condition.expression,
              defaultOutput: this.isRecord(condition.defaultOutput) ? condition.defaultOutput : undefined,
            };
          })
        : [],
    };
  }

  private validateFusionRule(rule: unknown, workflowId: string): FusionRule {
    if (!this.isRecord(rule) || typeof rule.id !== 'string' || typeof rule.fusedAdapterId !== 'string') {
      throw new WorkflowPlanError(`Workflow ${workflowId} has an invalid fusion rule`);
    }

    if (!Array.isArray(rule.moduleIds) || rule.moduleIds.some((entry) => typeof entry !== 'string')) {
      throw new WorkflowPlanError(`Workflow ${workflowId} has invalid moduleIds in fusion rule ${rule.id}`);
    }

    return {
      id: rule.id,
      moduleIds: rule.moduleIds,
      adapterType: typeof rule.adapterType === 'string' ? rule.adapterType : rule.fusedAdapterId,
      fusedAdapterId: rule.fusedAdapterId,
      condition: typeof rule.condition === 'string' ? rule.condition : undefined,
    };
  }

  private validateInputMapping(mapping: unknown, workflowId: string): ModuleInputMapping {
    if (!this.isRecord(mapping) || typeof mapping.moduleId !== 'string' || !Array.isArray(mapping.inputs)) {
      throw new WorkflowPlanError(`Workflow ${workflowId} has an invalid input mapping`);
    }

    return {
      moduleId: mapping.moduleId,
      inputs: mapping.inputs.map((binding) => {
        if (!this.isRecord(binding) || typeof binding.paramName !== 'string' || typeof binding.sourceType !== 'string') {
          throw new WorkflowPlanError(`Workflow ${workflowId} has an invalid input binding for ${mapping.moduleId}`);
        }

        return {
          paramName: binding.paramName,
          sourceType: binding.sourceType as ModuleInputMapping['inputs'][number]['sourceType'],
          sourceModuleId: typeof binding.sourceModuleId === 'string' ? binding.sourceModuleId : undefined,
          sourceKey: typeof binding.sourceKey === 'string' ? binding.sourceKey : undefined,
          path: typeof binding.path === 'string' ? binding.path : undefined,
          required: binding.required === undefined ? false : Boolean(binding.required),
          value: binding.value,
        };
      }),
    };
  }

  private readPositiveInteger(value: unknown, label: string, fallback?: number): number {
    if (value === undefined && fallback !== undefined) {
      return fallback;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new WorkflowPlanError(`${label} must be a non-negative integer`);
    }

    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}