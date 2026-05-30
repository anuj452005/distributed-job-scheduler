import type { WorkflowStepInput } from '@flowforge/shared';
import { topologicalSort } from './topological-sort.js';

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: Array<{ field: string; message: string }> };

interface HandlerRegistryLike {
  has(name: string): boolean;
}

/**
 * Validates a workflow DAG against all business rules:
 * 1. Unique step keys
 * 2. Handler existence
 * 3. Dependency references
 * 4. No cycles (using Kahn's algorithm)
 * 5. All steps reachable (included in topological sort)
 * 6. Retry policy bounds: maxAttempts in [1, 10], baseDelayMs in [100, 60_000]
 * 7. Timeout bounds: timeoutSeconds in [1, 3_600]
 *
 * All errors are collected before returning — does not short-circuit on first error.
 */
export function validateWorkflowDag(
  steps: WorkflowStepInput[],
  registry: HandlerRegistryLike
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  const stepKeys = new Set<string>();
  const duplicateKeys = new Set<string>();

  // 1. Unique step keys check
  for (const step of steps) {
    if (stepKeys.has(step.stepKey)) {
      duplicateKeys.add(step.stepKey);
    } else {
      stepKeys.add(step.stepKey);
    }
  }

  for (const dupKey of duplicateKeys) {
    errors.push({
      field: 'steps',
      message: `Duplicate step key: ${dupKey}`,
    });
  }

  // 2-3, 6-7. Handler existence, dependency references, retry policy, and timeout bounds checks
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Handler check
    if (!registry.has(step.handlerName)) {
      errors.push({
        field: `steps[${i}].handlerName`,
        message: `Step "${step.stepKey}" has unregistered handler "${step.handlerName}"`,
      });
    }

    // Dependency references check
    for (const dep of step.dependsOn) {
      if (!stepKeys.has(dep)) {
        errors.push({
          field: `steps[${i}].dependsOn`,
          message: `Step "${step.stepKey}" depends on non-existent step "${dep}"`,
        });
      }
    }

    // Retry policy checks
    const retry = step.retryPolicy;
    if (!retry || typeof retry.maxAttempts !== 'number' || retry.maxAttempts < 1 || retry.maxAttempts > 10) {
      errors.push({
        field: `steps[${i}].retryPolicy.maxAttempts`,
        message: `Step "${step.stepKey}" retryPolicy.maxAttempts must be between 1 and 10`,
      });
    }
    if (!retry || typeof retry.baseDelayMs !== 'number' || retry.baseDelayMs < 100 || retry.baseDelayMs > 60000) {
      errors.push({
        field: `steps[${i}].retryPolicy.baseDelayMs`,
        message: `Step "${step.stepKey}" retryPolicy.baseDelayMs must be between 100 and 60000`,
      });
    }

    // Timeout checks
    if (typeof step.timeoutSeconds !== 'number' || step.timeoutSeconds < 1 || step.timeoutSeconds > 3600) {
      errors.push({
        field: `steps[${i}].timeoutSeconds`,
        message: `Step "${step.stepKey}" timeoutSeconds must be between 1 and 3600`,
      });
    }
  }

  // 4-5. Cycle & Reachability check (only if there are no structural duplicate key or missing dependency errors)
  const hasStructuralErrors = errors.some(
    e => e.field === 'steps' || e.field.endsWith('.dependsOn')
  );

  if (!hasStructuralErrors && steps.length > 0) {
    try {
      topologicalSort(steps);
    } catch (err) {
      errors.push({
        field: 'steps',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
