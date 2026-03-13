export class WorkflowPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowPlanError';
  }
}

export class WorkflowExecutionError extends Error {
  constructor(
    message: string,
    public readonly stepId: string,
  ) {
    super(message);
    this.name = 'WorkflowExecutionError';
  }
}