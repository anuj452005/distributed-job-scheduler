import type { StepInput } from '../../api/workflows.ts';

const DEFAULT_RETRY_POLICY = { maxAttempts: 3, baseDelayMs: 1000 };

export function createDeterministicDemoSteps(): StepInput[] {
  return [
    {
      stepKey: 'load-sample',
      handlerName: 'transform-json',
      inputConfig: {
        expression: '{ "customerId": customer.id, "customerName": customer.name, "items": order.items, "total": order.total }',
        input: {
          customer: { id: 'cust-1042', name: 'Asha Raman' },
          order: {
            total: 148.5,
            items: [
              { sku: 'FLOW-1', quantity: 2 },
              { sku: 'FORGE-2', quantity: 1 },
            ],
          },
        },
      },
      retryPolicy: DEFAULT_RETRY_POLICY,
      timeoutSeconds: 30,
      dependsOn: [],
    },
    {
      stepKey: 'normalize-record',
      handlerName: 'transform-json',
      inputConfig: {
        expression: '{ "recordId": id, "status": "normalized", "amount": total, "currency": "USD" }',
        input: { id: 'order-9001', total: 148.5 },
      },
      retryPolicy: DEFAULT_RETRY_POLICY,
      timeoutSeconds: 30,
      dependsOn: ['load-sample'],
    },
    {
      stepKey: 'emit-summary',
      handlerName: 'transform-json',
      inputConfig: {
        expression: '{ "message": "Workflow completed", "recordId": recordId, "completed": true }',
        input: { recordId: 'order-9001' },
      },
      retryPolicy: DEFAULT_RETRY_POLICY,
      timeoutSeconds: 30,
      dependsOn: ['normalize-record'],
    },
  ];
}

export function createTransformStep(existingKeys: string[]): StepInput {
  let index = existingKeys.length + 1;
  let stepKey = `transform-${index}`;

  while (existingKeys.includes(stepKey)) {
    index += 1;
    stepKey = `transform-${index}`;
  }

  return {
    stepKey,
    handlerName: 'transform-json',
    inputConfig: {
      expression: '{ "result": value }',
      input: { value: `step-${index}` },
    },
    retryPolicy: DEFAULT_RETRY_POLICY,
    timeoutSeconds: 30,
    dependsOn: [],
  };
}
