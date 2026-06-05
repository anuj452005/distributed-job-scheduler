# Unit 02 — `@flowforge/trigger` Package & TriggerService Scaffold

> **Phase**: Phase 0 — Trigger Subsystem  
> **System Boundary**: `packages/trigger/` (new package)  
> **Depends On**: Unit 01 (trigger schema migrations), `@flowforge/shared`, `@flowforge/db`

---

## What This Unit Builds

Creates the `@flowforge/trigger` npm workspace package from scratch, establishes the package boundary, and scaffolds the `TriggerService` with its full public interface — including the atomic idempotency insertion and execution dispatch logic.

**Visible result**: `@flowforge/trigger` compiles clean with `tsc --noEmit`. The `triggerWorkflow` function can be imported and called from a test script.

---

## Files To Create

### `packages/trigger/package.json`

```json
{
  "name": "@flowforge/trigger",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "dependencies": {
    "@flowforge/db": "*",
    "@flowforge/engine": "*",
    "@flowforge/shared": "*"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

### `packages/trigger/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declarationDir": "dist"
  },
  "include": ["src/**/*"]
}
```

### `packages/trigger/src/types.ts`

Defines the public interface for calling `triggerWorkflow`:

```typescript
/**
 * Options required to fire a trigger and create a new workflow run.
 * All fields are required except idempotencyKey (NULL for cron runs).
 */
export interface TriggerOptions {
  triggerId: string;
  workflowId: string;
  payload: Record<string, unknown>;
  /**
   * External delivery ID (webhook/event only).
   * Pass undefined or omit for cron-sourced triggers — the
   * DB will store NULL, which bypasses the unique constraint.
   */
  idempotencyKey?: string;
  sourceType: 'cron' | 'webhook' | 'event';
  userId: string;
}

export type TriggerResult =
  | { status: 'SUCCEEDED'; runId: string }
  | { status: 'FAILED'; error: string }
  | { status: 'DEDUPLICATED' };
```

### `packages/trigger/src/trigger-service.ts`

```typescript
import type { Pool } from 'pg';
import { createWorkflowRun } from '@flowforge/engine';
import type { TriggerOptions, TriggerResult } from './types.js';

/**
 * Atomically claims a trigger execution slot and creates a WorkflowRun.
 *
 * Safety guarantees:
 * 1. If idempotencyKey is non-null, a second call with the same
 *    (triggerId, idempotencyKey) returns DEDUPLICATED without creating a run.
 * 2. If idempotencyKey is null (cron), each call always creates a new run.
 * 3. Execution dispatch (createWorkflowRun) happens OUTSIDE the claim
 *    transaction so that DB locks are not held during the engine call.
 */
export async function triggerWorkflow(
  pool: Pool,
  opts: TriggerOptions
): Promise<TriggerResult> {
  // Step 1: Atomic INSERT claim.
  // ON CONFLICT DO NOTHING returns 0 rows if the idempotency key already exists.
  const claimRes = await pool.query<{ id: string }>(
    `INSERT INTO workflow_trigger_executions
       (trigger_id, status, payload, idempotency_key, source_type)
     VALUES ($1, 'PENDING', $2, $3, $4)
     ON CONFLICT (trigger_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      opts.triggerId,
      JSON.stringify(opts.payload),
      opts.idempotencyKey ?? null,  // NULL → PostgreSQL treats as distinct
      opts.sourceType,
    ]
  );

  const claimId = claimRes.rows[0]?.id;
  if (!claimId) {
    // idempotency_key collision → safely skip
    return { status: 'DEDUPLICATED' };
  }

  // Step 2: Dispatch run creation (non-transactional, lock-free).
  try {
    const runDto = await createWorkflowRun(pool, opts.workflowId, opts.payload, opts.userId);

    await pool.query(
      `UPDATE workflow_trigger_executions
       SET status = 'SUCCEEDED', workflow_run_id = $1
       WHERE id = $2`,
      [runDto.id, claimId]
    );

    return { status: 'SUCCEEDED', runId: runDto.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    await pool.query(
      `UPDATE workflow_trigger_executions
       SET status = 'FAILED', error_message = $1
       WHERE id = $2`,
      [message, claimId]
    );

    return { status: 'FAILED', error: message };
  }
}
```

### `packages/trigger/src/index.ts`

```typescript
export { triggerWorkflow } from './trigger-service.js';
export type { TriggerOptions, TriggerResult } from './types.js';
```

---

## Monorepo Registration

Add `"@flowforge/trigger": "*"` to the `dependencies` section of any package that needs to fire triggers (e.g., `packages/scheduler`, `packages/api`). Also add the package path to the root `package.json` workspaces array if it isn't picked up automatically by the glob pattern.

---

## Design Decisions

### Why `createWorkflowRun` Outside the Claim Transaction?

The claim INSERT establishes idempotency in a single fast write. `createWorkflowRun` involves multiple DB writes (one `workflow_runs` row + N `step_runs` rows). Holding a transaction open across all of those writes would:
1. Block concurrent trigger insertions for the same trigger ID.
2. Risk long-running transaction timeouts under load.

By separating claim from dispatch, the lock is released in microseconds. The `PENDING` → `SUCCEEDED` / `FAILED` status update is a best-effort follow-up.

### Why `idempotencyKey ?? null` Not `idempotencyKey || null`?

`|| null` would coerce an **empty string** `""` to null. An empty string is a valid (if unusual) delivery ID. `?? null` only converts `undefined` to null, preserving `""` as a real key.

### Boundary Rule

`@flowforge/trigger` is a **pure service module**. It must not:
- Import from `packages/api/` or `packages/worker/`.
- Register HTTP routes or Fastify plugins.
- Know how it was called (HTTP webhook, cron tick, or Redis event).

---

## Verification Checklist

- [ ] `packages/trigger/` directory exists with `package.json`, `tsconfig.json`, `src/types.ts`, `src/trigger-service.ts`, `src/index.ts`
- [ ] `tsc --noEmit` from `packages/trigger/` exits 0
- [ ] `tsc --noEmit` from monorepo root exits 0 (all packages compile)
- [ ] `@flowforge/trigger` appears in `npm list --workspaces` output
- [ ] `triggerWorkflow` can be imported in a scratch test script without runtime error
- [ ] Manual call with a valid `triggerId` and `workflowId` returns `{ status: 'SUCCEEDED', runId: '<uuid>' }`
- [ ] Manual call with same `idempotencyKey` a second time returns `{ status: 'DEDUPLICATED' }`
