# AI Workflow Rules

These are binding rules for any AI coding agent working on this codebase.
They are not suggestions. Follow them exactly.

---

## Overall Approach

Build FlowForge incrementally using a spec-driven workflow.

The context files in `flowforge/context/` define what to build, how to build it,
and the current state of progress. Always implement against these specs.
Never infer or invent behavior that is not explicitly defined in a context file.

When the spec is unclear, stop. Resolve the ambiguity in the relevant context
file first. Then implement.

---

## Scoping Rules

- Work on exactly one implementation unit at a time.
- An implementation unit is a single package boundary, a single API route group,
  a single database migration, or a single component — not a combination.
- Do not combine frontend and backend changes in one step unless the unit
  explicitly requires both (e.g. a new API route that is immediately consumed
  by a new UI component in the same feature).
- Do not refactor unrelated code while implementing a unit.
- Do not add fields to the database schema that are not required by the
  current unit, even if they "might be useful later."
- Do not implement V2 features (scheduler triggers, cron, backfill, priority)
  while building MVP units. Mark them as `TODO(v2):` comments and move on.

---

## When to Split Work

Split an implementation step into smaller steps if it requires:

- Changes to more than one package boundary at the same time
  (e.g. `packages/engine/` and `packages/worker/` in the same step).
- A database schema migration AND application logic changes in the same step.
- Both a new API route AND a new React page in the same step, unless they are
  trivially coupled.
- Behavior that is not fully defined in the context files — resolve the spec
  gap first, then split the implementation.
- A change that cannot be verified end-to-end within the same step.

If you cannot write a one-sentence description of what the step does and
what "done" looks like, the scope is too broad. Split it.

---

## Handling Missing or Ambiguous Requirements

- Do not invent product behavior. If a behavior is not specified in a context
  file, it does not exist yet.
- If a requirement is missing: add an open question to `progress-tracker.md`
  under an "Open Questions" section. Do not implement a guess.
- If a requirement is ambiguous: state the two possible interpretations in
  `progress-tracker.md` and ask for a decision before continuing.
- If a handler's input/output schema is not specified: do not create the handler.
  Add it to the open questions list and wait for a schema definition.
- If a database column is not defined in `architecture.md` or
  `flowforge_system_design.md`: do not add it. Propose it first.

---

## Protected Files

Do not modify the following files unless explicitly instructed to do so:

- `flowforge/context/*.md` — context docs are updated only when implementation
  decisions change, not as part of routine feature work.
- `packages/db/migrations/*.sql` — never edit a migration that has already been
  applied. Create a new migration instead.
- `packages/shared/types.ts` — shared types are changed only when a context doc
  decision requires it. Do not add types speculatively.
- Any file under `packages/dashboard/components/ui/` — these are generated or
  curated UI primitives. Extend them; do not rewrite them.
- `.env.example` — add new variables when they are required by a new unit, but
  never remove existing variables.
- `docker-compose.yml` — do not change service definitions without an explicit
  infrastructure decision.

---

## Invariants You Must Never Violate

These come directly from `architecture.md`. Never write code that breaks them.

1. **PostgreSQL is the only source of truth.** Never write workflow state to Redis.
2. **Workers commit with a fencing-token query.** Every success/failure write to
   `step_runs` must include `AND worker_id = :me AND lease_expires_at > NOW() AND status = 'RUNNING'`.
   A result with 0 rows updated means the lease was lost — discard the result.
3. **Steps are pre-created, never created on-the-fly.** All `StepRun` rows are
   inserted in `PENDING` state when the `WorkflowRun` is created. No code path
   may insert a `StepRun` row outside of run initialization.
4. **Handlers never write to `step_runs` or `workflow_runs`.** Handlers return
   a value or throw. The worker owns all DB writes.
5. **Workers never sleep for retry delays.** Set `next_run_at` and let the
   Scheduler promote the row. Never `await sleep(retryDelay)` in a worker.
6. **Raw secrets never appear in logs or payloads.** Workflow definitions use
   `connectionRef` names only. Decrypted credentials exist in memory during
   handler execution only. The log layer must strip them before writing to
   `step_logs`.
7. **DAG validation must pass before a workflow is saved.** Never persist a
   `Workflow` row if topological sort fails, a handler is unregistered, or a
   dependency reference is unresolvable.

---

## Keeping Documentation in Sync with Implementation

Update the relevant context file when any of the following change:

- A new package is added → update the System Boundaries table in `architecture.md`.
- A new database table or column is added → update the Storage Model in
  `architecture.md` and the schema in `flowforge_system_design.md`.
- A handler is added or removed → update the handler table in `architecture.md`.
- A new API route is added → note it in `architecture.md` if it is a new
  surface, or in `progress-tracker.md` as a completed unit.
- An invariant is strengthened or relaxed → update `architecture.md` invariants.
- A new environment variable is required → add it to `.env.example` and document
  its source in `architecture.md` (Deployment → Environment Variables table).
- A code pattern is established that should be followed everywhere → add it to
  `code-standards.md`.

Do not update context files to reflect aspirational future behavior. Only
document what is actually implemented and deployed.

---

## Verification Checklist Before Moving to the Next Unit

Do not mark a unit complete or start the next unit until all of these pass:

1. **The unit works end-to-end within its defined scope.**
   - If the unit is a worker claim query: write a test that inserts a `QUEUED`
     row, runs the claim, and asserts the row is `RUNNING` with a `worker_id`.
   - If the unit is an API route: test the happy path and one failure path
     with a real HTTP request against a local or test database.
   - If the unit is a React component: verify it renders without errors and
     that the SSE or REST data it depends on is wired correctly.

2. **No invariant from `architecture.md` was violated.**
   Review the invariants list. If the unit touches the worker, check the
   fencing query. If the unit touches logging, check secret redaction.

3. **`progress-tracker.md` reflects the completed unit.**
   Mark it done. Note any open questions that surfaced during implementation.

4. **`npm run build` passes with zero TypeScript errors.**
   Strict mode is required. `tsc --noEmit` must exit 0.

5. **No unrelated files were modified.**
   Run `git diff --name-only` and confirm every changed file belongs to the
   current unit. If an unrelated file was touched, revert it and create a
   separate step for it.

6. **The database migration (if any) is idempotent and forward-only.**
   No `DROP COLUMN`, `DROP TABLE`, or destructive changes without a migration
   plan explicitly approved in context docs.

7. **Environment variables required by the unit are documented.**
   New env vars appear in `.env.example` with a descriptive comment.
