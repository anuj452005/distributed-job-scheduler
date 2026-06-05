# Phase 1 — Unit 01: Dockerode Setup & Basic Connection

## What This Unit Builds

Adds the `dockerode` dependency to `packages/handlers` and establishes a
verified, programmatic connection from the worker process to the Docker daemon
via the Unix/Windows socket. Pulls and confirms the presence of the
`python:3.10-slim` base image. Registers an empty `python-script` handler
skeleton in the handler registry.

**Done looks like:**
- `npm ls dockerode` resolves in `packages/handlers`.
- Running the test script logs `Docker daemon reachable` and lists the local
  images, including `python:3.10-slim` (pulled if absent).
- `handlerRegistry.has('python-script')` returns `true` after
  `registerAllHandlers()`.
- `tsc --noEmit` exits 0 across the full monorepo.

---

## Dependencies

- Foundation Unit 01 — Monorepo scaffold exists.
- Foundation Unit 06 — `packages/handlers` registry and `registerAllHandlers()`
  are implemented.
- Docker daemon is running on the host (accessible via `/var/run/docker.sock`
  on Linux/macOS or `//./pipe/docker_engine` on Windows).

---

## System Boundary

All changes live entirely within `packages/handlers/`. No other package is
modified.

---

## Files to Create / Modify

```
packages/handlers/
├── package.json                         # [MODIFY] add 'dockerode' + '@types/dockerode'
└── src/
    ├── index.ts                         # [MODIFY] register 'python-script' handler
    └── handlers/
        └── python-script.ts             # [NEW] empty skeleton implementing StepHandler
```

---

## Implementation

### 1. Add `dockerode` to `packages/handlers`

```json
// packages/handlers/package.json — add to dependencies / devDependencies
{
  "dependencies": {
    "dockerode": "^3.3.5"
  },
  "devDependencies": {
    "@types/dockerode": "^3.3.29"
  }
}
```

Run `npm install` from the monorepo root to resolve the lock file.

### 2. Skeleton Handler (`python-script.ts`)

```ts
import type { StepHandler, StepContext } from '@flowforge/shared';
import Docker from 'dockerode';

/**
 * python-script handler — Phase 1 skeleton.
 * Full implementation is built across Phase 1 Units 01–09.
 */
export const pythonScriptHandler: StepHandler = async (
  ctx: StepContext,
  _input: unknown,
): Promise<Record<string, unknown>> => {
  const docker = new Docker(); // connects via /var/run/docker.sock by default

  ctx.logger.info('python-script handler invoked — Phase 1 skeleton');

  // Verify daemon connectivity
  const info = await docker.info();
  ctx.logger.info({ dockerVersion: info.ServerVersion }, 'Docker daemon reachable');

  // TODO(phase1-unit-02): scaffold temp workspace and volume mounts
  // TODO(phase1-unit-03): apply container hardening config
  // TODO(phase1-unit-04): run container with async heartbeat loop
  // TODO(phase1-unit-05): stream stdout/stderr logs
  // TODO(phase1-unit-06): parse __PROGRESS__ telemetry lines
  // TODO(phase1-unit-07): wire ctx.signal abort → container.kill()
  // TODO(phase1-unit-08): virtualenv dependency caching

  return {};
};
```

### 3. Register in `index.ts`

```ts
// Add to registerAllHandlers():
import { pythonScriptHandler } from './handlers/python-script.js';

handlerRegistry.register('python-script', pythonScriptHandler);
```

### 4. Ensure Base Image is Available

Add a one-off utility function (can be a standalone script in
`packages/handlers/src/scripts/ensure-base-image.ts`) that calls:

```ts
async function ensureBaseImage(docker: Docker, image: string): Promise<void> {
  const images = await docker.listImages({ filters: { reference: [image] } });
  if (images.length === 0) {
    await new Promise<void>((resolve, reject) => {
      docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2) =>
          err2 ? reject(err2) : resolve(),
        );
      });
    });
  }
}
```

This function will be called at worker startup in a later unit. For now verify
it manually or in a test.

---

## npm Dependencies

```
dockerode          ^3.3.5
@types/dockerode   ^3.3.29  (devDependency)
```

---

## Verification Checklist

- [ ] `npm ls dockerode` in `packages/handlers` resolves without errors.
- [ ] Instantiating `new Docker()` does NOT throw (daemon socket reachable).
- [ ] `docker.info()` returns a response with `ServerVersion` populated.
- [ ] `docker.listImages()` returns an array (may be empty on a fresh machine).
- [ ] `python:3.10-slim` is present or successfully pulled via `ensureBaseImage`.
- [ ] `handlerRegistry.has('python-script')` returns `true`.
- [ ] `handlerRegistry.getAll()` now returns 8 handler names (7 original + `python-script`).
- [ ] `pythonScriptHandler` is exported from `packages/handlers/src/index.ts`.
- [ ] `tsc --noEmit` exits 0 across the full monorepo.
- [ ] No other package files outside `packages/handlers/` are modified.
