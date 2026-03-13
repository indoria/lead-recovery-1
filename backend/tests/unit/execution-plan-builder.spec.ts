import { FusedAdapterRegistry } from 'src/adapters/fused/fused-adapter.registry';
import { ExecutionContext } from 'src/common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput } from 'src/common/interfaces/module.types';
import { WorkflowModule } from 'src/common/interfaces/workflow-module.interface';
import { ModuleRegistry } from 'src/common/registry/module-registry';
import { buildExecutionContext, testConfig } from './test-helpers';
import { ConditionEvaluator } from 'src/orchestrator/condition-evaluator';
import { ExecutionPlanBuilder } from 'src/orchestrator/execution-plan-builder';
import { FusionEngine } from 'src/orchestrator/fusion-engine';
import { FusedAdapter } from 'src/orchestrator/orchestrator.types';
import { WorkflowConfigService } from 'src/orchestrator/workflow-config.service';

function createModule(
  id: string,
  options?: {
    fusableWith?: string[];
    canSkip?: (context: ExecutionContext) => boolean;
  },
): WorkflowModule<ModuleInput, ModuleOutput> {
  return {
    id,
    execute: async () => ({}),
    validateInputs: () => [],
    getDependencies: () => [],
    isFusable: (adjacentModuleId: string) => options?.fusableWith?.includes(adjacentModuleId) ?? false,
    canSkip: (context: ExecutionContext) => options?.canSkip?.(context) ?? false,
  };
}

function createFusedAdapter(id: string, type: string, fusesModuleIds: string[]): FusedAdapter {
  return {
    id,
    type,
    fusesModuleIds,
    execute: async () => ({}),
    expandOutput: () => ({}),
  };
}

function createBuilder(): ExecutionPlanBuilder {
  const moduleRegistry = new ModuleRegistry();
  moduleRegistry.register('customer-data-retrieval', createModule('customer-data-retrieval', { fusableWith: ['customer-context-acquisition'] }));
  moduleRegistry.register('customer-context-acquisition', createModule('customer-context-acquisition', { fusableWith: ['customer-data-retrieval'] }));
  moduleRegistry.register('call-preparation', createModule('call-preparation'));
  moduleRegistry.register('call-initiation', createModule('call-initiation', { fusableWith: ['welcome-message'] }));
  moduleRegistry.register('welcome-message', createModule('welcome-message', { fusableWith: ['call-initiation'] }));
  moduleRegistry.register('conversation-loop', createModule('conversation-loop'));
  moduleRegistry.register('exception-handling', createModule('exception-handling', {
    canSkip: (context) => context.config.llm.hasBuiltInDeviation,
  }));
  moduleRegistry.register('conversation-logging', createModule('conversation-logging'));

  const fusedAdapterRegistry = new FusedAdapterRegistry();
  fusedAdapterRegistry.register(
    'crm-context-fused-adapter',
    createFusedAdapter('crm-context-fused-adapter', 'crm-context-fused', ['customer-data-retrieval', 'customer-context-acquisition']),
  );
  fusedAdapterRegistry.register(
    'telephony-welcome-fused-adapter',
    createFusedAdapter('telephony-welcome-fused-adapter', 'telephony-welcome', ['call-initiation', 'welcome-message']),
  );
  fusedAdapterRegistry.register(
    'full-conversational-ai-adapter',
    createFusedAdapter('full-conversational-ai-adapter', 'full-conversational-ai', ['call-initiation', 'welcome-message', 'conversation-loop']),
  );

  return new ExecutionPlanBuilder(
    new WorkflowConfigService(),
    new FusionEngine(moduleRegistry, fusedAdapterRegistry, new ConditionEvaluator()),
  );
}

describe('ExecutionPlanBuilder', () => {
  it('builds the default plan without active fusions', () => {
    const builder = createBuilder();
    const plan = builder.build('lead-recovery-call', {}, buildExecutionContext());

    expect(plan.activeFusionRuleIds).toEqual([]);
    expect(plan.steps.map((step) => step.id)).toEqual([
      'customer-data-retrieval',
      'customer-context-acquisition',
      'call-preparation',
      'call-initiation',
      'welcome-message',
      'conversation-loop',
      'exception-handling',
      'conversation-logging',
    ]);
  });

  it('activates telephony welcome fusion when configured', () => {
    const builder = createBuilder();
    const plan = builder.build(
      'lead-recovery-call',
      {},
      buildExecutionContext({
        config: {
          ...testConfig,
          telephony: {
            playsWelcomeOnConnect: true,
          },
        },
      }),
    );

    expect(plan.activeFusionRuleIds).toContain('telephony-welcome-fusion');
    const fusedStep = plan.steps.find((step) => step.id === 'telephony-welcome-fusion');
    expect(fusedStep).toMatchObject({
      type: 'fused',
      moduleIds: ['call-initiation', 'welcome-message'],
    });
  });

  it('skips exception handling when the llm has built-in deviation detection', () => {
    const builder = createBuilder();
    const plan = builder.build(
      'lead-recovery-call',
      {},
      buildExecutionContext({
        config: {
          ...testConfig,
          llm: {
            hasBuiltInDeviation: true,
          },
        },
      }),
    );

    const exceptionStep = plan.steps.find((step) => step.id === 'exception-handling');
    expect(exceptionStep).toMatchObject({
      status: 'skipped',
    });
  });
});