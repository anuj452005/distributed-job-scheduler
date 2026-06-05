# Phase 1 — Unit 08: Requirement Hashing & Virtualenv Cache

## What This Unit Builds

Implements the hashed dependency caching layer that eliminates repeated
`pip install` cold starts. Before the execution container is launched, the
handler computes a SHA-256 fingerprint of the `requirements` array, checks
whether a pre-built virtualenv directory exists on the host at
`/var/flowforge/cache/venvs/{hash}`, and either reuses it (cache hit) or builds
it (cache miss) via a temporary builder container.

**Done looks like:**
- First run with `requirements: ["pandas==2.0.3"]` triggers a builder container
  and the install takes ~30–90 seconds. The directory
  `/var/flowforge/cache/venvs/{hash}` is created on the host.
- Second run with the same `requirements` array: builder container is **not**
  spawned. The execution container starts in under 5 seconds (Success
  Criterion 9).
- Changing one package in `requirements` produces a different hash and builds a
  fresh cache directory — the old cache is untouched.
- Inside the execution container, `import pandas` succeeds (PYTHONPATH resolved
  from the cache volume).

---

## Dependencies

- Phase 1 Unit 03 — Container hardening config and `buildContainerConfig`
  accept `venvHash` (currently passed as `null`). This unit populates it.

---

## System Boundary

All changes live entirely within `packages/handlers/src/handlers/python-script.ts`.

---

## Files to Modify

```
packages/handlers/
└── src/
    └── handlers/
        └── python-script.ts    # [MODIFY] add hash, cache check, builder container
```

---

## Implementation

### 1. Compute Hash

```ts
import crypto from 'crypto';

/**
 * Computes a deterministic SHA-256 fingerprint of a sorted requirements array.
 * Sorting ensures that ["pandas", "requests"] and ["requests", "pandas"]
 * produce the same hash.
 */
function computeRequirementsHash(requirements: string[]): string {
  const sorted = [...requirements].sort();
  return crypto
    .createHash('sha256')
    .update(sorted.join('\n'))
    .digest('hex');
}
```

### 2. Cache Directory Constants

```ts
const VENV_CACHE_ROOT = '/var/flowforge/cache/venvs';

function getCacheDir(hash: string): string {
  return path.join(VENV_CACHE_ROOT, hash);
}
```

> On Windows dev environments, override `VENV_CACHE_ROOT` via an env variable:
> `FLOWFORGE_VENV_CACHE_ROOT`. Add to `.env.example`.

### 3. Cache Check

```ts
async function isCached(cacheDir: string): Promise<boolean> {
  try {
    await fs.access(cacheDir);
    return true;
  } catch {
    return false;
  }
}
```

### 4. Builder Container (cache miss)

```ts
/**
 * Spawns a temporary Docker container that runs pip install into the cache dir.
 * The cache dir is mounted writable only during the build, then becomes read-only
 * for all execution containers (Invariant 13).
 */
async function buildVenvCache(
  docker: Docker,
  requirements: string[],
  cacheDir: string,
  logger: StepContext['logger'],
): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });

  const requirementsTxt = requirements.join('\n');
  const requirementsPath = path.join(cacheDir, '_requirements.txt');
  await fs.writeFile(requirementsPath, requirementsTxt, 'utf-8');

  logger.info({ cacheDir, packages: requirements }, 'Cache miss — building virtualenv');

  const builderConfig: Docker.ContainerCreateOptions = {
    Image: 'python:3.10-slim',
    Cmd: [
      'pip', 'install',
      '--target', '/cache',
      '--no-cache-dir',
      '-r', '/cache/_requirements.txt',
    ],
    User: '0:0', // pip needs root to install; the result dir is read-only at runtime
    HostConfig: {
      Binds: [`${cacheDir}:/cache`],  // writable during build only
      NetworkMode: 'bridge',          // pip needs network access to PyPI
      Memory: 512 * 1024 * 1024,
      NanoCpus: 500_000_000,
    },
  };

  const builder = await docker.createContainer(builderConfig);
  await builder.start();
  const { StatusCode } = await builder.wait();
  await builder.remove({ force: true });

  if (StatusCode !== 0) {
    // Clean up the partially-written cache dir so we don't serve corrupt libs
    await fs.rm(cacheDir, { recursive: true, force: true });
    throw new Error(
      `pip install failed with exit code ${StatusCode}. ` +
      `Requirements: ${requirements.join(', ')}`,
    );
  }

  logger.info({ cacheDir }, 'Virtualenv cache built successfully');
}
```

### 5. Ensure Cache Exists

```ts
async function ensureVenvCache(
  docker: Docker,
  requirements: string[],
  logger: StepContext['logger'],
): Promise<string | null> {
  if (!requirements || requirements.length === 0) return null;

  const hash = computeRequirementsHash(requirements);
  const cacheDir = getCacheDir(hash);

  if (!(await isCached(cacheDir))) {
    await buildVenvCache(docker, requirements, cacheDir, logger);
  } else {
    logger.info({ cacheDir }, 'Virtualenv cache hit');
  }

  return hash;
}
```

### 6. Update `buildContainerConfig` to Accept Non-Null Hash

Unit 03 already passed `venvHash` through to `buildContainerConfig`. Now that
this unit populates it, the volume bind and `PYTHONPATH` are activated:

```ts
// Already handled in Unit 03 skeleton:
if (venvHash) {
  binds.push(`/var/flowforge/cache/venvs/${venvHash}:/app/venv:ro`); // Invariant 13
  env.push('PYTHONPATH=/app/venv');
}
```

### 7. Integration into Handler Body

```ts
export const pythonScriptHandler: StepHandler = async (ctx, input) => {
  const typedInput = input as PythonScriptInput;
  const paths = buildWorkspacePaths(ctx.stepRunId);
  const docker = new Docker();
  let container: Docker.Container | null = null;

  try {
    await scaffoldWorkspace(paths, typedInput.script, typedInput.inputs ?? {});

    // NEW: resolve virtualenv cache before spawning execution container
    const venvHash = await ensureVenvCache(
      docker,
      typedInput.requirements ?? [],
      ctx.logger,
    );

    const config = buildContainerConfig(paths, venvHash); // now non-null when deps exist
    const { exitCode, container: c } = await runContainer(docker, config, /* timeout */, ctx);
    container = c;

    if (exitCode !== 0) throw new Error(`Python script exited with code ${exitCode}`);

    return await readOutput(paths.outputPath);
  } finally {
    if (container) await removeContainer(container, ctx.logger);
    await cleanupWorkspace(paths.dir, ctx.logger);
  }
};
```

---

## Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `FLOWFORGE_VENV_CACHE_ROOT` | `/var/flowforge/cache/venvs` | Override for dev on Windows |

Add to `.env.example`.

---

## Verification Checklist

- [ ] First run with `requirements: ["requests==2.31.0"]`:
  - A builder container is logged and a new directory appears under
    `$FLOWFORGE_VENV_CACHE_ROOT`.
  - `import requests` inside `script.py` succeeds.
- [ ] Second run with identical `requirements` array:
  - No builder container is spawned (`"Virtualenv cache hit"` is logged).
  - Container starts and `import requests` succeeds.
  - Total startup time is under 5 seconds (Success Criterion 9).
- [ ] Changing `requirements: ["requests==2.30.0"]` produces a **different**
      hash and builds a new cache directory. The old directory is untouched.
- [ ] Builder container is fully removed after build (`docker ps -a` shows none).
- [ ] A bad package name (`requirements: ["notareallib==9.9.9"]`) causes
      `buildVenvCache` to throw after the builder exits non-zero.
- [ ] Cache directory is NOT created if pip fails (partially written dir is cleaned).
- [ ] Cache volume is mounted with `:ro` in the execution container
      (`docker inspect` shows `ReadWrite: false` for the venv bind).
- [ ] `tsc --noEmit` exits 0 across the full monorepo.
- [ ] `FLOWFORGE_VENV_CACHE_ROOT` is added to `.env.example`.
- [ ] Only `packages/handlers/src/handlers/python-script.ts` is modified.
