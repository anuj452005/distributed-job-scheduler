# Unit 06 — Handler Registry & Core Handlers

## What This Unit Builds

`packages/handlers` — all 7 predefined step handlers plus the registry
that maps handler names to async functions. Each handler has a Zod input
schema. The registry is imported by the worker and the engine (for
validation-only purposes).

**Done looks like:**
- `handlerRegistry.get('http-request')` returns a function.
- `handlerRegistry.getAll()` returns all 7 handler names.
- Each handler's Zod input schema rejects invalid input with a clear error.
- `http-request` handler can make a real HTTP GET and return the response body.
- The engine can use `handlerRegistry.has(name)` to validate handler existence
  during DAG validation without executing any handler.

---

## Dependencies

- Unit 01 — Monorepo scaffold.
- Unit 03 — `@flowforge/shared` types (`StepContext`, `StepHandler`).

---

## Files to Create

```
packages/handlers/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                   # exports registry + registerAll()
    ├── registry.ts                # HandlerRegistry class
    ├── handlers/
    │   ├── http-request.ts
    │   ├── send-email.ts
    │   ├── sql-query.ts
    │   ├── blob-to-postgres.ts
    │   ├── transform-json.ts
    │   ├── repo-indexer.ts
    │   └── embedding-generator.ts
    └── schemas/
        ├── http-request.schema.ts
        ├── send-email.schema.ts
        ├── sql-query.schema.ts
        ├── blob-to-postgres.schema.ts
        ├── transform-json.schema.ts
        ├── repo-indexer.schema.ts
        └── embedding-generator.schema.ts
```

---

## Registry Implementation

### `registry.ts`

```ts
import type { StepHandler } from '@flowforge/shared';

export class HandlerRegistry {
  private readonly handlers: Map<string, StepHandler> = new Map();

  register(name: string, handler: StepHandler): void {
    if (this.handlers.has(name)) {
      throw new Error(`Handler "${name}" is already registered`);
    }
    this.handlers.set(name, handler);
  }

  get(name: string): StepHandler {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Handler "${name}" is not registered`);
    return handler;
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  getAll(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const handlerRegistry = new HandlerRegistry();
```

---

## Handlers to Implement (MVP)

All handlers must:
1. Parse `input` against their Zod schema at the start. Throw if invalid.
2. Check `ctx.signal.aborted` at checkpoints and throw/return early if cancelled.
3. Use `ctx.logger` (Pino) for all logging — never `console.log`.
4. Never update `step_runs` or `workflow_runs` directly — return a value or throw.
5. Never log raw secrets or connection strings.

### `http-request`

**Input schema:**
```ts
z.object({
  method:  z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url:     z.string().url(),
  headers: z.record(z.string()).optional(),
  body:    z.unknown().optional(),
  timeoutMs: z.number().int().min(100).max(30_000).optional().default(10_000),
})
```

**Behavior:** Makes an HTTP request using `fetch`. Returns `{ status, headers, body }`.
Throws on non-2xx if `throwOnError: true` (default true).

### `send-email`

**Input schema:**
```ts
z.object({
  connectionRef: z.string(),    // named SMTP connection
  to:            z.array(z.string().email()).min(1),
  subject:       z.string(),
  body:          z.string(),
  html:          z.string().optional(),
})
```

**Behavior:** In MVP — log a `INFO` message stating the email would be sent and return
`{ sent: true, to, subject }`. Actual SMTP connection lookup requires `connection_refs`
(Unit 22). Mark the real connection lookup as `// TODO(unit-22): resolve connectionRef`.

### `sql-query`

**Input schema:**
```ts
z.object({
  connectionRef: z.string(),
  query:         z.string(),
  params:        z.array(z.unknown()).optional().default([]),
})
```

**Behavior:** In MVP — stub that logs and returns `{ rows: [], rowCount: 0 }`.
Mark real connection lookup as `// TODO(unit-22): resolve connectionRef`.

### `blob-to-postgres`

**Input schema:**
```ts
z.object({
  sourceConnectionRef: z.string(),
  targetConnectionRef: z.string(),
  blobPath:            z.string(),
  targetTable:         z.string(),
  columnMapping:       z.record(z.string()),
  batchSize:           z.number().int().min(1).max(10_000).default(500),
})
```

**Behavior:** MVP stub — logs intent and returns `{ rowsProcessed: 0 }`.
Mark as `// TODO(unit-22): resolve connectionRefs`.

### `transform-json`

**Input schema:**
```ts
z.object({
  expression: z.string(),          // JSONata expression
  input:      z.record(z.unknown()),
})
```

**Behavior:** Evaluate the JSONata expression against `input` using the `jsonata` npm
package. Return the transformed result. This handler is fully functional in MVP
(no connection ref needed).

### `repo-indexer`

**Input schema:**
```ts
z.object({
  repoUrl:   z.string().url(),
  branch:    z.string().default('main'),
  outputDir: z.string().optional(),
})
```

**Behavior:** MVP stub — logs and returns `{ filesIndexed: 0 }`.

### `embedding-generator`

**Input schema:**
```ts
z.object({
  connectionRef: z.string(),          // OpenAI or local model connection
  text:          z.string().min(1),
  model:         z.string().default('text-embedding-ada-002'),
})
```

**Behavior:** MVP stub — returns `{ embedding: [], dimensions: 0 }`.
Mark as `// TODO(unit-22): resolve connectionRef`.

---

## Registration in `index.ts`

```ts
import { handlerRegistry } from './registry.js';
import { httpRequestHandler } from './handlers/http-request.js';
// ... all other handlers

export function registerAllHandlers(): void {
  handlerRegistry.register('http-request',        httpRequestHandler);
  handlerRegistry.register('send-email',          sendEmailHandler);
  handlerRegistry.register('sql-query',           sqlQueryHandler);
  handlerRegistry.register('blob-to-postgres',    blobToPostgresHandler);
  handlerRegistry.register('transform-json',      transformJsonHandler);
  handlerRegistry.register('repo-indexer',        repoIndexerHandler);
  handlerRegistry.register('embedding-generator', embeddingGeneratorHandler);
}

export { handlerRegistry };
```

---

## npm Dependencies

```
zod
jsonata          (for transform-json)
```

---

## Verification Checklist

- [ ] `handlerRegistry.getAll()` returns all 7 names after `registerAllHandlers()`.
- [ ] `handlerRegistry.has('nonexistent')` returns `false`.
- [ ] `handlerRegistry.get('nonexistent')` throws with a clear error.
- [ ] Each handler's Zod schema rejects a clearly invalid input.
- [ ] `http-request` handler makes a real HTTP GET to `https://httpbin.org/get`
      and returns a response with `status: 200`.
- [ ] `transform-json` handler correctly evaluates a JSONata expression
      (e.g., `$.name` on `{ name: "test" }` returns `"test"`).
- [ ] No handler imports from `packages/queue`, `packages/db`, or `packages/engine`.
- [ ] No handler logs or returns a `connectionRef` value as-is (only the name, not secrets).
- [ ] `tsc --noEmit` exits 0 on `packages/handlers`.
