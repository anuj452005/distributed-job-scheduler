import type { WorkflowStepInput } from '@flowforge/shared';

/**
 * Performs topological sort using Kahn's algorithm.
 * Returns an array of sorted step keys.
 * Throws an Error if a cycle is detected, listing the offending step keys.
 */
export function topologicalSort(steps: WorkflowStepInput[]): string[] {
  const stepKeys = new Set(steps.map(s => s.stepKey));

  // Build adjacency list (dependency -> downstream steps) and in-degree map
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const step of steps) {
    adj.set(step.stepKey, []);
    inDegree.set(step.stepKey, 0);
  }

  for (const step of steps) {
    const u = step.stepKey;
    for (const dep of step.dependsOn) {
      // If the dependency refers to an external/non-existent step, it is caught by validation.
      // But we protect here to avoid crashing Kahn's algorithm.
      if (stepKeys.has(dep)) {
        const neighbors = adj.get(dep) || [];
        neighbors.push(u);
        adj.set(dep, neighbors);
      }
    }
    inDegree.set(u, step.dependsOn.filter(d => stepKeys.has(d)).length);
  }

  // Find all steps with in-degree = 0
  const queue: string[] = [];
  // Sort step keys to ensure deterministic processing when in-degree is same
  const sortedKeys = Array.from(stepKeys).sort();
  for (const key of sortedKeys) {
    if (inDegree.get(key) === 0) {
      queue.push(key);
    }
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    // To be deterministic, sort the queue or pull from front
    const u = queue.shift()!;
    sorted.push(u);

    const neighbors = adj.get(u) || [];
    // Sort neighbors to maintain deterministic order during queue addition
    neighbors.sort();

    for (const v of neighbors) {
      const currentInDegree = inDegree.get(v)! - 1;
      inDegree.set(v, currentInDegree);
      if (currentInDegree === 0) {
        queue.push(v);
      }
    }
  }

  if (sorted.length !== steps.length) {
    // Find keys that are not in the sorted list (offending cycle members)
    const offending = steps
      .map(s => s.stepKey)
      .filter(key => !sorted.includes(key));
    throw new Error(`Cycle detected in workflow steps: ${offending.join(', ')}`);
  }

  return sorted;
}
