import { ConditionEvaluator } from 'src/orchestrator/condition-evaluator';

describe('ConditionEvaluator', () => {
  it('throws a workflow plan error for malformed expressions', () => {
    const evaluator = new ConditionEvaluator();

    expect(() => evaluator.evaluate('{"==": [}', {})).toThrow('Invalid workflow condition expression');
  });
});