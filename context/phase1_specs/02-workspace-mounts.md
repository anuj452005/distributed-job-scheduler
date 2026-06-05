# Phase 1 — Unit 02: Temp Workspace Scaffolding & Volume Mounts

## What This Unit Builds

Implements the host-side temporary workspace lifecycle inside
`packages/handlers/src/handlers/python-script.ts`. For each step run, the
handler creates an isolated directory on the host, writes `script.py` and
`input.json` into it, creates an empty `output.json` as a mount target, and
maps the directory into the container at `/app/io` as a writable volume bind.

After container exit, it reads `output.json` back from the host path. Workspace
cleanup (recursive delete) is also implemented here, called from a `finally`
block that runs on every exit path (success, failure, timeout, abort).

**Done looks like:**
- Running the handler for a trivial `script.py` (e.g., `print("hello")`) creates
  `/tmp/flowforge/run_{stepRunId}/` on the host with `script.py` and `input.json`
  present before the container starts.
- After the container exits, `output.json` can be read and parsed from the host path.
- After cleanup, the workspace directory no longer exists on disk.
- The container's `/app/io` directory contains exactly the files written from the host.

---

## Dependencies

- Phase 1 Unit 01 — `dockerode` installed, Docker daemon reachable, skeleton handler exists.

---

## System Boundary

All changes live entirely within:
`packages/handlers/src/handlers/python-script.ts`

No migration, no new package, no API change.

---

## Files to Modify

```
packages/handlers/
└── src/
    └── handlers/
        └── python-script.ts    # [MODIFY] add workspace scaffold, volume binds, cleanup
```

---

## Implementation

### Workspace Paths

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const FLOWFORGE_TMP_ROOT = path.join(os.tmpdir(), 'flowforge');

function buildWorkspacePaths(stepRunId: string) {
  const dir = path.join(FLOWFORGE_TMP_ROOT, `run_${stepRunId}`);
  return {
    dir,
    scriptPath:  path.join(dir, 'script.py'),
    inputPath:   path.join(dir, 'input.json'),
    outputPath:  path.join(dir, 'output.json'),
  };
}
```

### Scaffold Workspace

```ts
async function scaffoldWorkspace(
  paths: ReturnType<typeof buildWorkspacePaths>,
  script: string,
  inputs: Record<string, unknown>,
): Promise<void> {
  await fs.mkdir(paths.dir, { recursive: true });
  await fs.writeFile(paths.scriptPath, script, 'utf-8');
  await fs.writeFile(paths.inputPath, JSON.stringify(inputs, null, 2), 'utf-8');
  // Pre-create output file so the Docker bind mount has a concrete target
  await fs.writeFile(paths.outputPath, '{}', 'utf-8');
}
```

### Cleanup Workspace

```ts
async function cleanupWorkspace(dir: string, logger: StepContext['logger']): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
    logger.info({ dir }, 'Workspace cleaned up');
  } catch (err) {
    // Never throw from cleanup — log and continue
    logger.error({ err, dir }, 'Failed to clean up workspace directory');
  }
}
```

### Volume Bind Configuration

```ts
// Inside the container config HostConfig:
HostConfig: {
  Binds: [
    `${paths.dir}:/app/io`, // writable bind for script.py, input.json, output.json
  ],
  // ... other constraints added in Unit 03
}
```

### Read Output

```ts
async function readOutput(outputPath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(outputPath, 'utf-8');
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Container wrote invalid JSON to output.json: ${raw.slice(0, 200)}`);
  }
}
```

### Full Handler Shape (after this unit)

```ts
export const pythonScriptHandler: StepHandler = async (
  ctx: StepContext,
  input: unknown,
): Promise<Record<string, unknown>> => {
  const typedInput = input as PythonScriptInput;
  const paths = buildWorkspacePaths(ctx.stepRunId);

  try {
    await scaffoldWorkspace(paths, typedInput.script, typedInput.inputs ?? {});
    ctx.logger.info({ dir: paths.dir }, 'Workspace scaffolded');

    // TODO(phase1-unit-03): add hardening config
    // TODO(phase1-unit-04): create & start container, attach streams, heartbeat
    // TODO(phase1-unit-05): pipe logs
    // TODO(phase1-unit-06): parse progress lines
    // TODO(phase1-unit-07): wire abort signal
    // TODO(phase1-unit-08): virtualenv cache

    const output = await readOutput(paths.outputPath);
    return output;
  } finally {
    await cleanupWorkspace(paths.dir, ctx.logger);
  }
};
```

---

## Input Type (used from Unit 01 onward)

```ts
type PythonScriptInput = {
  script: string;               // required — the full Python source code
  requirements?: string[];      // optional pip packages
  timeout_seconds?: number;     // default: 300
  inputs?: Record<string, unknown>;  // passed as input.json to the script
};
```

---

## Verification Checklist

- [ ] `scaffoldWorkspace()` creates the directory at the correct path
      (`/tmp/flowforge/run_{stepRunId}` on Linux, `%TEMP%/flowforge/...` on Windows).
- [ ] `script.py` content exactly matches `typedInput.script`.
- [ ] `input.json` is valid JSON matching `typedInput.inputs`.
- [ ] `output.json` exists as an empty `{}` before the container starts.
- [ ] `readOutput()` correctly parses the JSON from `output.json`.
- [ ] `readOutput()` throws a clear error if `output.json` contains invalid JSON.
- [ ] `cleanupWorkspace()` removes the directory after handler exit.
- [ ] Cleanup still runs even if an intermediate step throws (finally block).
- [ ] The `HostConfig.Binds` array contains `"<host_dir>:/app/io"`.
- [ ] No other packages outside `packages/handlers/` are modified.
- [ ] `tsc --noEmit` exits 0 across the full monorepo.
