# Unit 23 — End-to-End Integration & Docker Compose Polish

## What This Unit Builds

The integration verification gate. No new features. This unit runs through
all 10 success criteria from `project-overview.md`, fixes any gaps found,
and polishes the Docker Compose setup so the entire system starts
cleanly with a single command and a demo can be run within 5 minutes.

**Done looks like:**
- `docker compose up` starts without errors.
- All 10 success criteria pass (listed below).
- `docker compose up --scale worker=3` demonstrates horizontal scaling.
- A new developer can clone the repo, run `docker compose up`, and complete
  a workflow run end-to-end within 5 minutes.

---

## Dependencies

All 22 previous units must be complete and verified.

---

## The 10 Success Criteria to Verify

From `project-overview.md`:

### SC-1: DAG Validation

> A user can create a workflow with three or more steps and defined dependencies,
> save it, and receive a validation error (not a silent failure) if the DAG
> contains a cycle or references an unregistered handler.

**How to test:**
```bash
# Cycle test
curl -X POST http://localhost:3000/api/workflows \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cycle Test",
    "steps": [
      { "stepKey": "a", "handlerName": "http-request", "dependsOn": ["b"], ... },
      { "stepKey": "b", "handlerName": "http-request", "dependsOn": ["a"], ... }
    ]
  }'
# Expected: 422 with field-level error mentioning "cycle"
```

### SC-2: Dependency-Order Execution

> A workflow run executes all steps in dependency order: no step begins before
> all declared parent steps have status SUCCEEDED.

**How to test:**
Create a 3-step workflow: A → B → C. Trigger a run. Query `step_runs` every
500 ms during execution. At no point should `B` be `RUNNING` while `A` is `PENDING`.

### SC-3: No Duplicate Execution

> Two worker processes running concurrently on the same queue never execute the
> same `StepRun` twice within a single `attempt_group`.

**How to test:**
```bash
docker compose up --scale worker=2
# Trigger a workflow with one slow step (use http-request to httpbin.org/delay/2)
# After completion, check step_runs: attempt_count should be 1, exactly one worker_id recorded
```

### SC-4: Automatic Dead-Lettering

> A step that fails three consecutive times (maxAttempts: 3) is automatically
> moved to DEAD_LETTERED, and the WorkflowRun is FAILED.

**How to test:**
Create a workflow with `handlerName: "http-request"`, URL `http://localhost:9999`
(unreachable), `maxAttempts: 3`. Trigger a run. Within a few minutes (3 retry delays),
the step should be `DEAD_LETTERED` and the run `FAILED`.

### SC-5: Crash Recovery

> After a simulated worker crash, the orphaned step lease expires and the step
> is re-queued by the lease sweeper within one sweeper interval.

**How to test:**
```bash
# Start 2 workers, trigger a long-running step
docker compose up --scale worker=2
# Find the container running the step (check worker_id in DB)
docker compose stop worker  # kills all workers
# Wait 30s (lease duration) + 15s (sweeper interval)
# Query: step_runs should now be QUEUED with worker_id = NULL
# Start worker again: docker compose start worker
# Step should be picked up and completed
```

### SC-6: Replay Correctness

> A failed WorkflowRun can be replayed from a specified step: the new run shows
> SUCCEEDED for all pre-replay steps (original output payloads) and executes only
> from the replay point onward.

**How to test:**
```bash
# Create 3-step workflow: step-a (http-request, valid) → step-b (http-request, fails) → step-c
# Trigger run: step-a SUCCEEDED, step-b DEAD_LETTERED, run FAILED
# Replay from step-b:
curl -X POST http://localhost:3000/api/runs/<original-run-id>/replay \
  -H "Authorization: Bearer <token>" \
  -d '{ "fromStepKey": "step-b" }'
# Verify new run: step-a SUCCEEDED (with original output), step-b QUEUED → SUCCEEDED
```

### SC-7: Real-Time Dashboard

> Dashboard reflects step status changes within 3 seconds without page refresh.

**How to test:**
1. Open the run detail page in the browser.
2. Trigger a workflow run via API.
3. Observe the DAG nodes animate QUEUED → RUNNING → SUCCEEDED.
4. Verify the timing is within 3 seconds of each event.

### SC-8: Prometheus Metrics

> Prometheus exposes 5 required metrics, Grafana panel renders all without errors.

**How to test:**
```bash
curl http://localhost:3000/metrics | grep -E "flowforge_(jobs_total|queue_latency|worker_active|retry_total|dlq_depth)"
# All 5 metrics should appear
# Open http://localhost:3001 → FlowForge dashboard → all 5 panels show data
```

### SC-9: One-Command Start

> Entire system starts with `docker compose up` and a complete end-to-end run
> can be demonstrated within 5 minutes.

**How to test:**
```bash
git clone <repo>
cd distibuted-job-worker
cp .env.example .env    # fill in CLERK keys
docker compose up
# Within 5 minutes:
# - Sign in to dashboard at http://localhost:5173
# - Create a workflow with 2 steps
# - Trigger a run
# - Watch it complete in the DAG view
```

### SC-10: No Plaintext Secrets in DB

> No plaintext secret or connection string appears in any step_logs,
> step_runs, or workflow_steps row after a run that used named connection refs.

**How to test:**
```bash
psql $DATABASE_URL -c "SELECT * FROM step_logs WHERE message ILIKE '%password%' OR metadata::text ILIKE '%sk_test%'"
# Expected: 0 rows
psql $DATABASE_URL -c "SELECT output_payload FROM step_runs WHERE output_payload::text ILIKE '%password%'"
# Expected: 0 rows
```

---

## Docker Compose Polish Checklist

- [ ] `docker compose up` starts all 6 services (api, worker, postgres, redis,
      prometheus, grafana) without manual intervention.
- [ ] `docker compose up --scale worker=3` starts 3 independent worker processes.
- [ ] The API waits for postgres to be healthy before starting (use `healthcheck` +
      `depends_on: condition: service_healthy`).
- [ ] Migrations run automatically on API container startup.
- [ ] Grafana auto-provisions the FlowForge dashboard (no manual import needed).
- [ ] Prometheus auto-discovers the API scrape target.
- [ ] A `docker compose down -v` followed by `docker compose up` starts cleanly
      with an empty database (migrations re-applied).
- [ ] `.env.example` documents every required variable with comments.
- [ ] `README.md` documents the 5-minute quickstart: clone → `.env` → `docker compose up`.

---

## Docker Healthchecks

```yaml
# docker-compose.yml
services:
  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d flowforge"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }

  worker:
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
```

---

## Progress Tracker Update

After all 10 criteria pass, update `flowforge/context/progress-tracker.md`:

```markdown
## Current Phase
- Complete

## Completed
- Units 01–23: All MVP features implemented and verified

## Success Criteria Status
- SC-1: ✅ DAG validation rejects cycles and unknown handlers
- SC-2: ✅ Dependency-order execution verified
- SC-3: ✅ No duplicate execution with 2 workers
- SC-4: ✅ Dead-lettering after maxAttempts exhausted
- SC-5: ✅ Crash recovery via lease sweeper
- SC-6: ✅ Replay from step preserves prior outputs
- SC-7: ✅ Dashboard updates within 3 s
- SC-8: ✅ All 5 Prometheus metrics visible in Grafana
- SC-9: ✅ System starts with docker compose up
- SC-10: ✅ No plaintext secrets in DB after connected handler run
```

---

## Final Verification Checklist

- [ ] All 10 success criteria pass as described above.
- [ ] `docker compose up` → no errors in any container log.
- [ ] `docker compose up --scale worker=3` → 3 workers claim steps concurrently.
- [ ] `npm run build` across all packages exits 0 with zero TypeScript errors.
- [ ] No `any` types in any file (`grep -r ": any" packages/` returns 0 results).
- [ ] `progress-tracker.md` updated to reflect complete status.
- [ ] Git history is clean: each unit has its own commit on its own branch,
      merged to main after user verification.
