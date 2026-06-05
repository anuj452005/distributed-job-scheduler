# Phase 1 — Unit 03: Container Hardening & Security Constraints

## What This Unit Builds

Implements the full `containerConfig` object inside `python-script.ts` with all
security constraints required by the architecture invariants. This is the point
where the handler transitions from a stub that writes files into one that
actually creates and runs a real Docker container — with hard resource limits,
network isolation, a read-only root filesystem, and a non-root user.

**Done looks like:**
- A container created by the handler reports `NetworkMode: none` via
  `docker inspect`.
- A Python script attempting `import urllib.request; urllib.request.urlopen(...)``
  raises `OSError: [Errno 101] Network is unreachable`.
- The container cannot write to any path outside `/app/io` (read-only rootfs).
- Running `docker inspect <id>` shows `User: "1000:1000"`.
- A memory-excessive script (`x = [0]*999999999`) is killed by the OOM limit.
- `docker inspect <id>` shows `Memory: 536870912` (512 MB) and
  `NanoCpus: 500000000`.

---

## Dependencies

- Phase 1 Unit 01 — `dockerode` installed, skeleton handler registered.
- Phase 1 Unit 02 — Workspace scaffold and volume bind implemented.

---

## System Boundary

All changes live entirely within:
`packages/handlers/src/handlers/python-script.ts`

---

## Files to Modify

```
packages/handlers/
└── src/
    └── handlers/
        └── python-script.ts    # [MODIFY] full containerConfig + create/start/wait lifecycle
```

---

## Implementation

### Container Config

```ts
const SANDBOX_IMAGE = 'python:3.10-slim';

function buildContainerConfig(
  paths: WorkspacePaths,
  venvHash: string | null,  // null until Unit 08 implements caching
): Docker.ContainerCreateOptions {
  const binds: string[] = [
    `${paths.dir}:/app/io`,   // writable workspace
  ];

  // venvHash mount added in Unit 08
  if (venvHash) {
    binds.push(`/var/flowforge/cache/venvs/${venvHash}:/app/venv:ro`);
  }

  const env: string[] = ['PYTHONUNBUFFERED=1'];
  if (venvHash) {
    env.push('PYTHONPATH=/app/venv');
  }

  return {
    Image: SANDBOX_IMAGE,
    Cmd: ['python3', '/app/io/script.py'],
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    User: '1000:1000',           // Invariant 10: non-root execution
    Env: env,
    HostConfig: {
      Binds: binds,
      NetworkMode: 'none',       // Invariant 9: hard network isolation
      Memory: 512 * 1024 * 1024, // Invariant 11: 512 MB RAM limit
      NanoCpus: 500_000_000,     // Invariant 11: 0.5 CPU cores
      ReadonlyRootfs: true,      // Invariant 12: read-only root filesystem
      // Runtime: 'runsc',       // TODO(phase1-unit-09): enable gVisor when available
    },
  };
}
```

### Container Lifecycle (create → start → wait)

```ts
async function runContainer(
  docker: Docker,
  config: Docker.ContainerCreateOptions,
  timeoutMs: number,
  ctx: StepContext,
): Promise<{ exitCode: number; container: Docker.Container }> {
  const container = await docker.createContainer(config);
  ctx.logger.info({ containerId: container.id }, 'Container created');

  await container.start();
  ctx.logger.info({ containerId: container.id }, 'Container started');

  // TODO(phase1-unit-04): attach heartbeat here
  // TODO(phase1-unit-05): attach log streaming here
  // TODO(phase1-unit-07): attach abort signal here

  // Wait for container to finish (blocking within this async function)
  const result = await container.wait();
  const exitCode: number = result.StatusCode;

  ctx.logger.info({ containerId: container.id, exitCode }, 'Container exited');
  return { exitCode, container };
}
```

### Cleanup After Run

```ts
async function removeContainer(
  container: Docker.Container,
  logger: StepContext['logger'],
): Promise<void> {
  try {
    await container.remove({ force: true }); // Invariant 14
    logger.info({ containerId: container.id }, 'Container removed');
  } catch (err) {
    logger.error({ err }, 'Failed to remove container');
  }
}
```

### Integration into Handler Body

```ts
export const pythonScriptHandler: StepHandler = async (ctx, input) => {
  const typedInput = input as PythonScriptInput;
  const paths = buildWorkspacePaths(ctx.stepRunId);
  const docker = new Docker();
  let container: Docker.Container | null = null;

  try {
    await scaffoldWorkspace(paths, typedInput.script, typedInput.inputs ?? {});

    const config = buildContainerConfig(paths, null /* venvHash — Unit 08 */);
    const timeoutMs = (typedInput.timeout_seconds ?? 300) * 1_000;

    const { exitCode, container: c } = await runContainer(docker, config, timeoutMs, ctx);
    container = c;

    if (exitCode !== 0) {
      throw new Error(`Python script exited with code ${exitCode}`);
    }

    return await readOutput(paths.outputPath);
  } finally {
    if (container) await removeContainer(container, ctx.logger);
    await cleanupWorkspace(paths.dir, ctx.logger);
  }
};
```

---

## Security Invariants Enforced in This Unit

| Invariant | Enforcement |
|---|---|
| Invariant 9 — Network isolation | `NetworkMode: 'none'` in `HostConfig` |
| Invariant 10 — Non-root | `User: '1000:1000'` in container config |
| Invariant 11 — Resource limits | `Memory: 536870912`, `NanoCpus: 500000000` |
| Invariant 12 — Read-only rootfs | `ReadonlyRootfs: true` in `HostConfig` |
| Invariant 14 — Guaranteed cleanup | `container.remove({ force: true })` in `finally` |

---

## Verification Checklist

- [ ] `docker inspect <id>` shows `NetworkMode: "none"`.
- [ ] A script running `import socket; socket.create_connection(("8.8.8.8", 53))`
      raises `OSError` inside the container.
- [ ] `docker inspect <id>` shows `User: "1000:1000"`.
- [ ] `docker inspect <id>` shows `Memory: 536870912` and `NanoCpus: 500000000`.
- [ ] A script attempting `open('/etc/shadow', 'r')` raises `PermissionError`
      (rootfs is read-only).
- [ ] Writing to `/app/io/output.json` from within the script succeeds.
- [ ] A non-zero exit code (`sys.exit(1)`) causes the handler to throw.
- [ ] `container.remove()` is called in the `finally` block on both success and
      failure paths — verify via `docker ps -a` (container should not appear after).
- [ ] Workspace directory is deleted after handler completes.
- [ ] `tsc --noEmit` exits 0 across the full monorepo.
- [ ] No files outside `packages/handlers/src/handlers/python-script.ts` are modified.
