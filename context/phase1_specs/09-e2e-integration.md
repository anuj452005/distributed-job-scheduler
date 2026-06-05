# Phase 1 — Unit 09: E2E Sandbox Integration & Verification

## What This Unit Builds

The final Phase 1 integration milestone. No new code is written for the happy
path — this unit wires together any remaining integration gaps, writes a
comprehensive end-to-end test suite, and verifies that all 10 Success Criteria
from `project-overview.md` pass against a real Docker daemon and a live
PostgreSQL database.

It also locks in the container hardening by verifying runtime constraints
(network block, resource limits, read-only rootfs) and proves the full data
flow from `POST /api/workflows/:id/runs` → worker claim → Docker container →
`step_runs.status = SUCCEEDED` with live log delivery to the dashboard.

**Done looks like:**
- All 10 Success Criteria in `project-overview.md §8` pass and are logged as
  verified.
- A multi-step workflow with one TypeScript handler and one `python-script`
  handler runs end-to-end via `docker compose up`.
- A Phase 1 integration test file passes with zero failures.

---

## Dependencies

All Phase 1 units 01–08 must be complete and individually verified:

| Unit | Status required |
|---|---|
| 01 — Dockerode Setup | ✅ Complete |
| 02 — Workspace Mounts | ✅ Complete |
| 03 — Container Hardening | ✅ Complete |
| 04 — Async Loop & Heartbeat | ✅ Complete |
| 05 — Live Log Streaming | ✅ Complete |
| 06 — Progress Telemetry | ✅ Complete |
| 07 — Cooperative Abort | ✅ Complete |
| 08 — Virtualenv Cache | ✅ Complete |

---

## System Boundary

This unit may touch:

| Location | What may change |
|---|---|
| `packages/handlers/src/handlers/python-script.ts` | Minor bug fixes only — no new features |
| `packages/worker/src/poll-loop.ts` | Minor wiring fixes discovered during integration |
| `packages/api/` | Timeout or concurrency config fixes only |
| `context/progress-tracker.md` | Mark all Phase 1 milestones complete |
| `context/architecture.md` | Update Handlers table with `python-script` entry |
| `.env.example` | Any missing env variables discovered during integration |

No new packages. No database migrations.

---

## Success Criteria Verification Map

Each Success Criterion from `project-overview.md §8` maps to a specific test
scenario:

| # | Criterion | Test Scenario |
|---|---|---|
| 1 | DAG Integrity | `POST /api/workflows` with a cyclic step dependency → expect `422` with `"Cyclic dependency detected"` |
| 2 | Topological Ordering | Step D depends on B and C. Verify D stays `PENDING` until both B and C are `SUCCEEDED`, then enters `QUEUED`. |
| 3 | Network Block | Script: `import socket; socket.create_connection(("8.8.8.8", 53), timeout=2)` → must raise `OSError`. |
| 4 | Resource Limits | Script: `while True: pass` → worker timeout kills container; step enters `FAILED` or `RETRYING`. |
| 5 | Live Console Logs | Script: `print("hello-sc5")` → row appears in `step_logs` with `message = "hello-sc5"` while container is running; SSE delivers it to dashboard within 3s. |
| 6 | Progress Bars | Script: `print(f"__PROGRESS__ {json.dumps({'percent': 75})}")` → `step_runs.progress = 75` before container exits. |
| 7 | Non-Blocking Heartbeat | While a 5-minute container runs, two additional `QUEUED` steps are claimed and completed without waiting for the long container. `lease_expires_at` advances every ~10s. |
| 8 | Fast Cancellation | Operator cancels a running workflow → container killed, workspace deleted, `step_runs.status = CANCELLED` within 2 seconds. |
| 9 | Cache Reuse | Two identical `requirements` runs → builder container only spawned on first run; second run starts in under 5 seconds. |
| 10 | One-Command Boot | `docker compose up` starts API, worker, and dependencies; a sample workflow runs end-to-end with no manual steps. |

---

## Test File Location

```
packages/handlers/
└── src/
    └── handlers/
        └── python-script.integration.test.ts   # [NEW] full E2E integration tests
```

> Integration tests require `DOCKER_AVAILABLE=true` and a live PostgreSQL
> connection. They should be tagged (e.g., `@integration`) and excluded from
> the standard unit test run.

---

## Sample Integration Test Structure

```ts
// python-script.integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Docker from 'dockerode';
import { db } from '@flowforge/db';

const SKIP = process.env.DOCKER_AVAILABLE !== 'true';

describe.skipIf(SKIP)('python-script handler — Phase 1 integration', () => {

  it('SC-3: network is blocked inside execution container', async () => {
    const result = await runPythonScript(
      `import socket\ntry:\n  socket.create_connection(("8.8.8.8", 53), timeout=2)\n  print("connected")\nexcept OSError:\n  import json\n  with open("/app/io/output.json","w") as f:\n    json.dump({"network_blocked": True}, f)`,
      [],
    );
    expect(result.output.network_blocked).toBe(true);
  });

  it('SC-5: log line appears in step_logs while container is running', async () => {
    // Implementation: run script that sleeps then prints; poll step_logs
    // during sleep window and assert row exists
  });

  it('SC-6: __PROGRESS__ line updates step_runs.progress', async () => {
    // Implementation: run script that prints progress then sleeps;
    // poll step_runs.progress during sleep
  });

  it('SC-8: cancel kills container within 2 seconds', async () => {
    // Implementation: start script with time.sleep(300);
    // call cancelWorkflowRun(); measure time to CANCELLED status
  });

  it('SC-9: second run with same requirements skips builder', async () => {
    // Implementation: run twice, measure time; assert second < 5000ms
  });

  // ... remaining criteria
});
```

---

## Documentation Updates Required in This Unit

Before marking Phase 1 complete, update the following context files:

### `architecture.md` — Handler Registry Table

Add `python-script` to the handler list:

| Handler Name | Package | Behavior |
|---|---|---|
| `python-script` | `packages/handlers` | Executes user-supplied Python in a hardened Docker container |

### `architecture.md` — Storage Model

Add to File Storage section:
- Workspace root: `/tmp/flowforge/run_{stepRunId}` (created per-run, deleted on exit)
- Virtualenv cache: `/var/flowforge/cache/venvs/{sha256_hash}` (persistent, read-only mount)

### `progress-tracker.md`

Mark all Phase 1 milestones (Milestone 1–9 from `diagrams/version2/phase1_sanbox.md`) as `[x]`.

---

## Verification Checklist

- [ ] All 10 Success Criteria pass against a real Docker daemon + live DB.
- [ ] `docker compose up` starts the full stack and a sample Python workflow
      completes end-to-end with no manual intervention.
- [ ] Integration test file runs with `DOCKER_AVAILABLE=true` and all assertions
      pass.
- [ ] `docker ps -a` shows no dangling containers after all tests complete.
- [ ] No orphaned workspace directories remain under `/tmp/flowforge/` after
      all tests complete.
- [ ] All 14 architecture invariants are confirmed not violated by the final
      implementation (review checklist in `architecture.md`).
- [ ] `architecture.md` updated with `python-script` handler entry and storage
      model additions.
- [ ] `progress-tracker.md` updated with Phase 1 milestones marked complete.
- [ ] `tsc --noEmit` exits 0 across the full monorepo with zero errors in strict
      mode.
- [ ] `git diff --name-only` shows only files relevant to Phase 1 units.
