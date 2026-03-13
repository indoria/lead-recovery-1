import { Injectable } from '@nestjs/common';
import { WorkflowPlanError } from './orchestrator.errors';

type PrimitiveExpression = string | number | boolean | null;
type Expression = PrimitiveExpression | { [key: string]: Expression } | Expression[];

@Injectable()
export class ConditionEvaluator {
  evaluate(expression: string | undefined, scope: Record<string, unknown>): boolean {
    if (!expression) {
      return true;
    }

    try {
      const parsed = JSON.parse(expression) as Expression;
      return Boolean(this.resolve(parsed, scope));
    } catch (error) {
      throw new WorkflowPlanError(
        `Invalid workflow condition expression: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private resolve(expression: Expression, scope: Record<string, unknown>): unknown {
    if (Array.isArray(expression)) {
      return expression.map((entry) => this.resolve(entry, scope));
    }

    if (typeof expression !== 'object' || expression === null) {
      return expression;
    }

    if ('var' in expression && typeof expression.var === 'string') {
      return this.getByPath(scope, expression.var);
    }

    if ('==' in expression && Array.isArray(expression['=='])) {
      const [left, right] = expression['=='];
      return this.resolve(left as Expression, scope) === this.resolve(right as Expression, scope);
    }

    if ('and' in expression && Array.isArray(expression.and)) {
      return expression.and.every((entry) => Boolean(this.resolve(entry as Expression, scope)));
    }

    if ('or' in expression && Array.isArray(expression.or)) {
      return expression.or.some((entry) => Boolean(this.resolve(entry as Expression, scope)));
    }

    if ('!' in expression) {
      return !Boolean(this.resolve(expression['!'] as Expression, scope));
    }

    return expression;
  }

  private getByPath(value: unknown, path: string): unknown {
    if (path.trim().length === 0) {
      return value;
    }

    return path.split('.').reduce<unknown>((current, key) => {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }

      return (current as Record<string, unknown>)[key];
    }, value);
  }
}