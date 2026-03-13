import { ExecutionContext } from '../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput, ValidationError } from '../common/interfaces/module.types';

export interface SkipCondition {
  moduleId?: string;
  expression: string;
  defaultOutput?: ModuleOutput;
}

export interface StepConfig {
  moduleId: string;
  order: number;
  required: boolean;
  timeoutMs: number;
  skipConditions?: SkipCondition[];
}

export interface FusionRule {
  id: string;
  moduleIds: string[];
  adapterType: string;
  fusedAdapterId: string;
  condition?: string;
}

export type InputSourceType = 'request' | 'step-output' | 'context' | 'literal';

export interface InputBinding {
  paramName: string;
  sourceType: InputSourceType;
  sourceModuleId?: string;
  sourceKey?: string;
  path?: string;
  required?: boolean;
  value?: unknown;
}

export interface ModuleInputMapping {
  moduleId: string;
  inputs: InputBinding[];
}

export interface WorkflowDefinition {
  workflowId: string;
  steps: StepConfig[];
  fusionRules: FusionRule[];
  inputMappings: ModuleInputMapping[];
  maxRetries: number;
  retryDelayMs: number;
}

export interface PlannedStep {
  id: string;
  type: 'module' | 'fused';
  order: number;
  moduleIds: string[];
  required: boolean;
  timeoutMs: number;
  adapterId?: string;
  adapterType?: string;
  status: 'planned' | 'skipped';
  reason?: string;
  defaultOutput?: ModuleOutput;
}

export interface ExecutionPlan {
  workflowId: string;
  steps: PlannedStep[];
  activeFusionRuleIds: string[];
}

export interface FusedAdapter<I extends ModuleInput = ModuleInput, O extends ModuleOutput = ModuleOutput> {
  readonly id: string;
  readonly type: string;
  readonly fusesModuleIds: string[];
  execute(input: I, context: ExecutionContext): Promise<O>;
  expandOutput(output: O): Record<string, ModuleOutput>;
  validateInputs?(input: I): ValidationError[];
}

export interface WorkflowExecutionResult {
  workflowId: string;
  plan: ExecutionPlan;
  stepOutputs: Record<string, ModuleOutput>;
}