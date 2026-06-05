# FlowForge — Phase 1 Build Plan

> Read this file before starting any implementation unit.
> Each unit maps to the milestones in `diagrams/version2/phase1_sanbox.md`.

---

## Guiding Rules

- **One unit at a time.** Never start the next unit until the current one passes all checks in the Verification Checklist (`ai-workflow-rules.md`).
- **Test locally before committing.** Verify container behaviors (timeouts, CPU/RAM restrictions, networks) before moving forward.
- **Keep PostgreSQL stable.** No database migrations are allowed for Phase 1. All configuration is read from `input_config` JSONB.
- **Clean up resources.** Always clean up Docker containers and temporary directories on exit, whether successful, failed, or aborted.

---

## Stack Summary

| Concern             | Technology                                                |
|---------------------|-----------------------------------------------------------|
| Container Engine    | Docker Daemon accessed via `/var/run/docker.sock`         |
| Container SDK       | `dockerode` (programmatic Node.js client)                 |
| Sandbox Sandbox     | gVisor (`runsc` runtime) or standard Docker cgroups       |
| Sandbox Image       | `python:3.10-slim` (run as non-root user `1000:1000`)     |
| Runtime Resource Limits | 512MB RAM limit, 0.5 CPU cores (`NanoCpus` = 500000000)  |
| Network Isolation   | NetworkMode: `none` (hard isolation)                      |
| Host IPC Binding    | Bound directory mounting (`input.json` / `output.json`)   |
| Telemetry Stream    | Line-by-line Standard Output / Standard Error tailing     |
| Cache Volume        | Hashed virtualenv volumes mapped from host cache directory|

---

## Build Order

| # | Unit Name | Spec File | What It Delivers |
|---|-----------|-----------|------------------|
| 01 | Dockerode Setup & Basic Connection | [01-dockerode-setup.md](./01-dockerode-setup.md) | `dockerode` installed in `packages/handlers`. Docker daemon connection verified. `python-script` handler skeleton registered. Base image pulled. |
| 02 | Temp Workspace Scaffolding & Mounts | [02-workspace-mounts.md](./02-workspace-mounts.md) | Host temp directory `/tmp/flowforge/run_{stepRunId}` created per run. `script.py`, `input.json`, `output.json` written and bound to `/app/io` inside container. Cleanup guaranteed in `finally`. |
| 03 | Container Hardening & Security | [03-container-hardening.md](./03-container-hardening.md) | Full `containerConfig`: `NetworkMode: none`, `User: 1000:1000`, `Memory: 512MB`, `NanoCpus: 0.5`, `ReadonlyRootfs: true`. Container create → start → wait lifecycle implemented. |
| 04 | Async Execution Loop & Lease Heartbeat | [04-async-loop-heartbeat.md](./04-async-loop-heartbeat.md) | Non-blocking Promise dispatch in `poll-loop.ts`. Concurrent step execution up to `WORKER_MAX_CONCURRENCY`. Heartbeat fires `AbortController` on lease loss. |
| 05 | Live Log Streaming | [05-live-log-streaming.md](./05-live-log-streaming.md) | `container.attach()` stream split line-by-line. Plain lines → `step_logs` DB insert + Redis `step.log` event. `__PROGRESS__` lines filtered for Unit 06. |
| 06 | Progress Telemetry IPC Parser | [06-progress-telemetry.md](./06-progress-telemetry.md) | `__PROGRESS__ <json>` lines parsed → `step_runs.progress` updated + Redis `step.progress` event. Malformed lines log warning and are skipped. |
| 07 | Cooperative Container Abort | [07-cooperative-abort.md](./07-cooperative-abort.md) | `ctx.signal` abort listener registered after `container.start()`. Abort → `container.kill()` + `container.remove()` + workspace delete. CANCELLED status committed. |
| 08 | Requirement Hashing & Virtualenv Cache | [08-virtualenv-cache.md](./08-virtualenv-cache.md) | SHA-256 of `requirements` array → cache dir check → builder container spawns on miss. Cache mounted read-only at `/app/venv` on `PYTHONPATH`. |
| 09 | E2E Sandbox Integration & Verification | [09-e2e-integration.md](./09-e2e-integration.md) | All 10 Success Criteria verified against live Docker + DB. Integration test suite. Architecture docs updated. Phase 1 milestones marked complete. |

---

## Notes

- Units **01–03** lay down the programmatic sandbox layer inside `packages/handlers/src/handlers/python-script.ts`.
- Unit **04** bridges this sandbox runner to the worker execution queue, assuring it does not block worker concurrency.
- Units **05–07** add live stream observability (logs/progress) and lifecycle abort handlers.
- Unit **08** optimizes execution startup time by skipping duplicate package installations.
- Unit **09** is the integration milestone to prove that all success criteria are met.
