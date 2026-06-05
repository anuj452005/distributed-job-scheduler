# AI Workflow Rules

These are binding rules for any AI coding agent working on this codebase. They are not guidelines or recommendations — they are absolute constraints. You must follow them exactly.

---

## 1. Overall Approach

1. **Be Spec-Driven**: Build FlowForge strictly against the specifications defined in `flowforge/context/`. Do not infer, assume, or invent product features, database fields, or business logic. If it is not explicitly written in a context specification, it does not exist.
2. **Develop Incrementally**: Build and verify one logical feature step at a time. Never attempt a large, multi-component change in a single run.
3. **Fail Fast on Ambiguity**: If a context specification is silent, unclear, or contradictory regarding a requirement, stop. Do not make a guess. Raise a question and wait for clarification.

---

## 2. Scoping Rules

1. **Implement One Unit at a Time**: Work on exactly one implementation unit at a time (e.g., a single API route group, a single database migration, a single handler, or a single UI page). 
2. **Restrict Scope**: Do not combine backend and frontend implementation in a single step unless they are tightly coupled and cannot be verified independently.
3. **No Speculative Changes**: Do not add fields, components, utilities, or dependencies that are not directly required by the active unit "just because they might be useful later."
4. **No Unrelated Refactoring**: Do not touch or clean up code outside the files directly relevant to the current implementation unit.
5. **Enforce MVP Boundaries**: Do not implement V2 features (such as cron trigger schedulers, scaling controls, or custom web editors). Mark them as `TODO(v2):` and ignore them.

---

## 3. When to Split Work

You must split an implementation step into separate, smaller steps if it involves any of the following:
1. **Multi-Package Changes**: Changes crossing more than one package boundary (e.g., modifying `packages/engine/` and `packages/worker/` simultaneously).
2. **Schema and Logic Mixing**: Executing a database migration and writing the application code that uses it in the same step.
3. **Full-Stack Features**: Building a new API route and creating the dashboard page that calls it. Build, verify, and commit the API route first, then build the UI.
4. **Unverifiable Code**: Any change that cannot be verified end-to-end (via automated tests, manual testing, or logs) within the current step.

---

## 4. Handling Missing or Ambiguous Requirements

1. **Stop Executing**: Stop coding immediately when you identify a gap or contradiction in the requirements.
2. **Document Gaps**: Add the requirement gap or ambiguity to `flowforge/context/progress-tracker.md` under an explicit "Open Questions" header.
3. **Wait for Approval**: Do not write fallback code, mock behaviors, or defaults. Wait for explicit instructions or a specification update before proceeding.

---

## 5. Protected Files (Do Not Modify)

Do not modify the following files unless explicitly instructed to do so:
1. **Database Migrations**: `packages/db/migrations/*.sql`. Never modify an existing migration file that has already been applied. Create a new, forward-only SQL file.
2. **Shared Types**: [types.ts](file:///c:/gitandgithub/project2026/distibuted-job-worker/flowforge/packages/shared/src/types.ts). Do not add, edit, or delete types in this file unless a specification update demands it.
3. **Generated UI Library Components**: Any component under `packages/dashboard/src/components/ui/` (or similar UI primitives directory). If a component needs customization, extend it via wrappers or layout props; do not edit the underlying primitive.
4. **Environment Defaults**: `.env.example`. You may append new required environment variables but never delete or change existing defaults.
5. **Compose Files**: `docker-compose.yml`. Do not change container networks, ports, or service volumes without explicit permission.

---

## 6. Keeping Documentation in Sync

You must update the relevant context files before marking an implementation unit as complete:
1. **Boundary Changes**: Update the System Boundaries table in `architecture.md` if folders or packages are added or modified.
2. **Storage Changes**: Update the Storage Model in `architecture.md` if database tables, cached host folders, or Redis keys are added.
3. **Registry Changes**: Update the Handlers list in `architecture.md` if a new handler (e.g., a Python or AI executor) is registered.
4. **Environment Changes**: Add any new environment variables to `.env.example` along with a description of its source in the `architecture.md` Deployment section.
5. **Standards Updates**: Add newly established patterns to `code-standards.md`.
6. **Progress Logging**: Mark items as complete (`[x]`) in `progress-tracker.md` only after they have been fully verified.

---

## 7. Invariants You Must Never Violate

These rules represent the correctness, safety, and security foundation of the platform. You must write all code to strictly enforce these constraints:

### State & Transaction Invariants
1. **PostgreSQL is the single source of truth.** You must never store workflow, step run, or lease states in Redis. Redis is strictly for ephemeral Pub/Sub event broadcasting.
2. **You must commit worker results using the fencing-token query.** Every database write marking a step run `SUCCEEDED` or `FAILED` must verify `id = :step_run_id AND worker_id = :worker_id AND status = 'RUNNING' AND lease_expires_at > NOW()`. If 0 rows are updated, discard the output and fail the claim.
3. **Pre-create all step runs.** You must insert all `StepRun` rows in the `PENDING` state when the `WorkflowRun` is initialized. You are strictly forbidden from creating `StepRun` entries on-the-fly during execution.
4. **Do not write to the database from within handlers.** Handlers must only return plain outputs or throw errors. The worker process alone manages all database updates to step runs.
5. **Never block the worker with sleeps.** Do not write `sleep()` routines in workers for retries. Workers must immediately yield on delay. The Scheduler alone promotes rows based on the `next_run_at` timestamp.
6. **Strip secrets before logging.** Decrypted credentials must exist only in memory. You must filter out and redact any secret, password, or token matching `connection_refs` before writing entries to `step_logs`.
7. **Enforce DAG validation before save.** You must reject any workflow containing cycles, unregistered handlers, or invalid dependencies at the API layer before database persistence.

### Container & Sandbox Security Invariants
8. **Isolate sandbox networks.** You must set the Docker runtime configuration to `NetworkMode: 'none'` for all execution sandboxes.
9. **Never run containers as root.** You must configure all execution containers with `User: '1000:1000'` to prevent host privilege escalation.
10. **Enforce container resource quotas.** You must set strict memory limits (max 512MB RAM) and CPU quotas (max 0.5 CPU cores via `NanoCpus = 500000000`) for all running sandboxes.
11. **Mount filesystems read-only.** The container root filesystem must be mounted as read-only (`ReadonlyRootfs: true`). Writable files must be restricted entirely to the bound `/app/io` workspace directory.
12. **Lock cached virtualenv volumes.** Mount the host virtualenv cache directory (`/var/flowforge/cache/venvs/*`) using the read-only mount parameter (`ro`) to prevent running scripts from writing or modifying cached libraries.
13. **Guarantee container and workspace cleanup.** On step completion (success, failure, timeout, or cancellation/abort), you must explicitly stop and remove the Docker container and recursively delete the temporary host workspace directory.

---

## 8. Verification Checklist

You are strictly forbidden from starting the next implementation unit or closing a task until all of these verification checks pass:

1. **Verify End-to-End Scope**: Ensure the unit is fully operational.
   - For database changes: Verify connection and index usage.
   - For handlers: Verify script processing, logging, and error exits.
   - For API routes: Test the happy path and failure status codes (e.g., 400, 403, 404) with real requests.
2. **Run Lint and Build**: Run the build compiler (`npm run build` or equivalent `tsc --noEmit`). The build must compile with **zero TypeScript errors** in strict mode.
3. **Verify Invariants**: Review the 13 invariants above. Verify that no newly written line of code bypasses a fencing query, writes state to Redis, leaks a credential, runs a container as root, or bypasses network blocks.
4. **Assert No Unrelated Changes**: Run `git diff --name-only` (or check active workspace diffs). Verify that only files directly associated with the current unit are modified. Revert any accidental changes to unrelated files.
5. **Validate Environment Configuration**: Verify that any new environment variables are added to `.env.example` with descriptive instructions.
6. **Update Progress Tracker**: Update the status checklist in `progress-tracker.md` to reflect completed items.
