# FlowForge — Phase 1 Specification & Implementation Plan
## Programmatic Docker/gVisor Execution Sandbox Layer

---

## 🎯 1. Phase Goal
The objective of Phase 1 is to elevate FlowForge from a **distributed task orchestrator running pre-registered TypeScript business logic** to a **secure, isolated, code-execution platform** running arbitrary user-supplied Python script steps.

We accomplish this by keeping the existing PostgreSQL queue and lease orchestration 100% stable while moving the runtime execution from the Node.js worker's process into **non-privileged, resource-constrained Docker/gVisor containers**.

---

## 🏗️ 2. Monorepo Alignment Map

The implementation maps cleanly into the existing modular codebase boundary lines of [flowforge](file:///c:/gitandgithub/project2026/distibuted-job-worker/flowforge):

```
flowforge/
├── packages/
│   ├── shared/                # Active StepContext, StepHandler, and StepEvent types
│   ├── handlers/              # Registered handlers (http-request, transform-json, etc.)
│   │   └── src/
│   │       ├── registry.ts    # Central TypeScript handler map
│   │       └── handlers/
│   │           └── python-script.ts   # [NEW] Programmatic Docker execution handler
│   ├── worker/                # Worker polling loop (poll-loop.ts) and Heartbeating
│   │   └── package.json       # [MODIFY] Add 'dockerode' dependency
│   └── queue/                 # Database SKIP LOCKED claims, commits, and lease heartbeats
```

---

## 🔒 3. Primary Core Decisions (Synchronized with Codebase)

### 3.1 PostgreSQL Remains the Orchestration Source of Truth
PostgreSQL continues managing `step_runs` queues, timeouts, leases, and DAG parent-child promotions. Kafka is intentionally excluded from Phase 1 to isolate concerns and maintain transaction atomic safety until execution is robust.

### 3.2 Programmatic Containerization (`dockerode`)
Rather than spawning CLI subprocesses (e.g. `docker run ...`), the Worker interacts directly with the Docker daemon via the standard Unix/Windows socket `/var/run/docker.sock` using the programmatic **`dockerode`** library. This ensures real-time control over logs, event streaming, and process abort signals.

### 3.3 Zero Database Migrations via JSONB Configurations
To keep migrations light and prevent breaking the ReactFlow dashboard, all script details are passed inside the `input_config` JSONB field in `workflow_steps`:
```json
{
  "script": "import json\nimport sys\n# Script code here...",
  "requirements": ["pandas", "requests"],
  "timeout_seconds": 300,
  "inputs": {
    "data_url": "https://api.example.com/v1"
  }
}
```

---

## 🐍 4. Programmatic Executor Contract (`packages/handlers`)

The programmatic Python executor lives as a standard handler mapping to the existing `StepHandler` signature defined in [types.ts](file:///c:/gitandgithub/project2026/distibuted-job-worker/flowforge/packages/shared/src/types.ts).

### 4.1 Script Execution Signature Blueprint (`python-script.ts`)
```typescript
import type { StepHandler, StepContext } from '@flowforge/shared';
import Docker from 'dockerode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import crypto from 'crypto';

type PythonScriptInput = {
  script: string;
  requirements?: string[];
  timeout_seconds?: number;
  inputs?: Record<string, unknown>;
};

export const pythonScriptHandler: StepHandler = async (
  ctx: StepContext,
  input: unknown
): Promise<Record<string, unknown>> => {
  const typedInput = input as PythonScriptInput;
  const script = typedInput.script;
  const requirements = typedInput.requirements || [];
  const timeoutMs = (typedInput.timeout_seconds || 300) * 1000;
  const runInputs = typedInput.inputs || {};

  const docker = new Docker();
  const stepRunId = ctx.stepRunId;
  
  // 1. Establish Isolated Workspace
  const hostWorkdir = path.join(os.tmpdir(), 'flowforge', `run_${stepRunId}`);
  await fs.mkdir(hostWorkdir, { recursive: true });

  const scriptPath = path.join(hostWorkdir, 'script.py');
  const inputPath = path.join(hostWorkdir, 'input.json');
  const outputPath = path.join(hostWorkdir, 'output.json');

  await fs.writeFile(scriptPath, script);
  await fs.writeFile(inputPath, JSON.stringify(runInputs, null, 2));
  
  // Create an empty output file so Docker mount has a solid target
  await fs.writeFile(outputPath, '{}');

  ctx.logger.info({ hostWorkdir }, 'Created sandboxed script workspace');

  // 2. Set Up Sandbox Security Rules
  const image = 'python:3.10-slim';
  const containerConfig = {
    Image: image,
    Cmd: ['python3', '/app/io/script.py'],
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    User: '1000:1000', // Non-root user
    Env: ['PYTHONUNBUFFERED=1'],
    HostConfig: {
      Binds: [
        `${hostWorkdir}:/app/io`
      ],
      NetworkMode: 'none', // Hard network isolation
      Memory: 512 * 1024 * 1024, // 512MB RAM Limit
      NanoCpus: 500000000,       // 0.5 CPU Cores Limit
      ReadonlyRootfs: true,      // Read-only Container Filesystem
      Runtime: 'runsc'          // Optional: Force gVisor runtime if enabled
    }
  };

  // Remaining container spawn, logs tailing, and abort bindings...
  return {};
};
```

---

## 🔄 5. Multi-Threaded Heartbeat & Non-Blocking Promise Loop

To ensure the worker's PostgreSQL claiming loop remains non-blocking while executing a containerized script, we implement the **Asynchronous Event-Driven Loop** structure inside [poll-loop.ts](file:///c:/gitandgithub/project2026/distibuted-job-worker/flowforge/packages/worker/src/poll-loop.ts):

```
Worker claim Loop
  │
  ├──► Claims task via SKIP LOCKED
  ├──► Begins container execution Promise
  │      │
  │      ├──► Starts interval: setInterval(updateLease, 10000)
  │      ├──► Container runs (30 mins)
  │      └──► Container terminates
  │             └──► Clears interval (clearInterval)
  │
  └──► Ready to poll next claim (if concurrency slots remain)
```

This prevents long-running Python scripts from blocking queue-claim loops, allowing the system to run many concurrent step executions on a single Node.js worker event loop without thread resource overhead.

---

## 📈 6. Standardized Standard Output IPC Protocols

To make long-running scripts highly observable, we establish two programmatic Standard Output conventions for logging and progress reporting.

### 6.1 Real-Time Log Streaming
The worker spawns the Docker container, attaches to the container streams, and pipes stdout/stderr buffers line-by-line:
1. Every plain string written to stdout is routed immediately through `ctx.logger.info(line)` and committed to the `step_logs` database table.
2. The logs are published via Redis Pub/Sub so they render live in the console tab of the Dashboard.

### 6.2 Standard Output Progress IPC (Regex Capture)
Python scripts can report dynamic execution metrics (e.g. training iterations or process chunks) by printing a standardized JSON prefix:
```python
import json
import sys

def report_progress(percent: int, stage: str):
    print(f"__PROGRESS__ {json.dumps({'percent': percent, 'stage': stage})}", flush=True)

# Inside running code:
report_progress(60, "Parsing embeddings matrix")
```
The Worker tails the stdout stream. When it identifies a line matching `/^__PROGRESS__ (.*)/`:
1. It extracts the JSON payload: `{"percent": 60, "stage": "Parsing embeddings matrix"}`.
2. It executes an atomic database update to the step run record and fires a status event to Redis, updating the ReactFlow node progress bar instantly.

---

## 🛑 7. Abort & Cooperative Container Cancellation

When an operator cancels a running workflow on the dashboard, the API triggers a cancellation route:
1. The worker loop receives a cancellation command or abort trigger.
2. The `StepContext` standard `AbortSignal` (`ctx.signal`) transitions to `aborted = true`.
3. The programmatic runner intercepts the `ctx.signal.aborted` event and terminates the Docker container instantly:
   ```typescript
   ctx.signal.addEventListener('abort', async () => {
     try {
       ctx.logger.warn('Abort signal triggered — shutting down Docker container');
       await container.kill();
       await container.remove();
     } catch (err) {
       ctx.logger.error({ err }, 'Failed to stop container on abort');
     }
   });
   ```
4. This terminates host resources immediately and cleans up the temporary directory.

---

## 📦 8. Hashed Virtualenv Volume Caching
Instead of performing an expensive `pip install` on PyPI inside the container for every single execution, we implement **Virtualenv Volume Mapping**:

```
[ Step Definition requirements ] ──► Hashed to SHA-256 (e.g., 'venv_a5d8...')
                                               │
                                 Exists on Host Cache directory?
                                         ├─── YES ──► Mount Cache volume direct to pythonpath
                                         └─── NO  ──► Spawn builder ➔ run pip install ➔ Cache
```

1. Hash the `requirements` array: `crypto.createHash('sha256').update(requirements.join(',')).digest('hex')` ➔ `venv_hash`.
2. Check if a cached directory exists on the host at `/var/flowforge/cache/venvs/venv_hash`.
3. If missing:
   - Spin up a brief builder container.
   - Run `pip install --target=/cache/venv_hash -r requirements.txt`.
   - Save the installed libs to the host folder `/var/flowforge/cache/venvs/venv_hash`.
4. When the Python sandbox is launched, mount the cached directory as a read-only volume in the execution sandbox and set the `PYTHONPATH` environment variable so Python resolves the cached dependencies instantly.

---

## 🚀 9. Milestone Build & Validation Checklist

This sequence maps our step-by-step roadmap to implement this cleanly in the monorepo:

* [ ] **Milestone 1**: Programmatic Docker socket connection using `dockerode` inside `@flowforge/handlers`.
* [ ] **Milestone 2**: File Volume mapping on host temp workspaces for input/output JSON passing.
* [ ] **Milestone 3**: Lifecycle management wrapping error logs, timeouts, and non-zero exit code traps.
* [ ] **Milestone 4**: Async timer heartbeat integration into `poll-loop.ts` to renew Postgres leases.
* [ ] **Milestone 5**: Standard Output progress parser capturing `__PROGRESS__` lines.
* [ ] **Milestone 6**: Real-time stdout stream tailing to `step_logs` and Redis Pub/Sub events.
* [ ] **Milestone 7**: Abort Signal registration killing container and cleaning temporary file workspaces.
* [ ] **Milestone 8**: Hashed virtualenv caching volume implementation.
* [ ] **Milestone 9**: Hardening container limits (Read-only rootfs, cgroup RAM/CPU controls, gVisor integration).