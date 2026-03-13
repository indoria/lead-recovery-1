import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '../common/interfaces/execution-context.interface';
import { ModuleInput } from '../common/interfaces/module.types';
import { WorkflowPlanError } from './orchestrator.errors';
import { InputBinding, ModuleInputMapping } from './orchestrator.types';

@Injectable()
export class InputResolver {
  resolve(
    targetId: string,
    mappings: ModuleInputMapping[],
    workflowInput: ModuleInput,
    context: ExecutionContext,
  ): ModuleInput {
    const mapping = mappings.find((entry) => entry.moduleId === targetId);
    if (!mapping) {
      return {};
    }

    const resolved: ModuleInput = {};
    for (const binding of mapping.inputs) {
      const value = this.resolveBinding(binding, workflowInput, context);
      if (value === undefined) {
        continue;
      }

      resolved[binding.paramName] = value;
    }

    return resolved;
  }

  private resolveBinding(binding: InputBinding, workflowInput: ModuleInput, context: ExecutionContext): unknown {
    const value = (() => {
      switch (binding.sourceType) {
        case 'request':
          return this.getByPath(workflowInput, binding.path);
        case 'step-output': {
          if (!binding.sourceModuleId) {
            throw new WorkflowPlanError(`Missing sourceModuleId for ${binding.paramName}`);
          }

          const output = context.stepOutputs.get(binding.sourceModuleId);
          return this.getByPath(output, binding.sourceKey);
        }
        case 'context':
          return binding.path === 'stepOutputs'
            ? this.serializeStepOutputs(context.stepOutputs)
            : this.getByPath(context as unknown as ModuleInput, binding.path);
        case 'literal':
          return binding.value;
        default:
          throw new WorkflowPlanError(`Unsupported source type: ${String(binding.sourceType)}`);
      }
    })();

    if (value === undefined && binding.required) {
      throw new WorkflowPlanError(`Unable to resolve required input ${binding.paramName}`);
    }

    return value;
  }

  private getByPath(value: unknown, path: string | undefined): unknown {
    if (!path || path.trim().length === 0) {
      return value;
    }

    return path.split('.').reduce<unknown>((current, key) => {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }

      return (current as Record<string, unknown>)[key];
    }, value);
  }

  private serializeStepOutputs(stepOutputs: Map<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
    return Object.fromEntries(stepOutputs.entries());
  }
}