# Unit 16 — Prometheus Metrics Endpoint *(V2 — Deferred)*

> **This unit is deferred to V2. Do NOT implement during the MVP build.**
> Skip from Unit 15 directly to Unit 17.
> Pino stdout logs are sufficient observability for MVP.

---

## What This Unit Builds

`GET /metrics` — a Prometheus-compatible metrics endpoint exposing the 5
required metrics. Grafana is configured to scrape it and render a
dashboard panel for each metric.

**Done looks like:**
- `curl http://localhost:3000/metrics` returns Prometheus text format with
  all 5 metrics present.
- After running a workflow: `flowforge_jobs_total` has incremented,
  `flowforge_queue_latency_seconds` has a histogram with p50/p95/p99 buckets.
- Grafana at `http://localhost:3001` has a provisioned dashboard panel for
  each of the 5 metrics — all render without "No data" errors.

---

## Dependencies

- Unit 04 — `packages/db` pool (for DLQ depth and active worker queries).
- Unit 11 — API server registered.

---

## Files to Create / Modify

```
packages/api/src/routes/
└── metrics/
    └── index.ts                # GET /metrics

packages/api/src/metrics/
├── registry.ts                 # Prometheus registry + metric definitions
└── collectors.ts               # DB-backed collectors (DLQ depth, active workers)

docker/grafana/
├── provisioning/
│   ├── datasources/
│   │   └── prometheus.yaml
│   └── dashboards/
│       └── flowforge.yaml
└── dashboards/
    └── flowforge.json           # Grafana dashboard JSON with 5 panels
```

---

## Required Metrics

All 5 metrics are defined in `project-overview.md` success criterion #8.

| Metric | Type | Description |
|--------|------|-------------|
| `flowforge_jobs_total` | Counter | Total step executions completed (label: `status` = `succeeded`/`failed`/`dead_lettered`) |
| `flowforge_queue_latency_seconds` | Histogram | Time from step entering `QUEUED` to entering `RUNNING` (buckets: p50, p95, p99) |
| `flowforge_worker_active` | Gauge | Count of `step_runs` currently in `RUNNING` state (queried from DB) |
| `flowforge_retry_total` | Counter | Total step retry attempts |
| `flowforge_dlq_depth` | Gauge | Count of `step_runs` in `DEAD_LETTERED` state (queried from DB) |

---

## Implementation

### `registry.ts`

Use the `prom-client` npm package.

```ts
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const metricsRegistry = new Registry();

export const jobsTotal = new Counter({
  name:    'flowforge_jobs_total',
  help:    'Total step executions completed',
  labelNames: ['status'],
  registers: [metricsRegistry],
});

export const queueLatency = new Histogram({
  name:    'flowforge_queue_latency_seconds',
  help:    'Time from QUEUED to RUNNING (seconds)',
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [metricsRegistry],
});

export const workerActive = new Gauge({
  name:    'flowforge_worker_active',
  help:    'Step runs currently in RUNNING state',
  registers: [metricsRegistry],
});

export const retryTotal = new Counter({
  name:    'flowforge_retry_total',
  help:    'Total step retry attempts',
  registers: [metricsRegistry],
});

export const dlqDepth = new Gauge({
  name:    'flowforge_dlq_depth',
  help:    'Step runs currently in DEAD_LETTERED state',
  registers: [metricsRegistry],
});
```

### How Metrics Are Updated

- `jobsTotal.inc({ status: 'succeeded' })` — called in the worker's commit
  success path (wire this in `packages/worker` using the metrics from this
  package, or via a simple counter event — design choice: pass a metrics
  callback into the worker context to avoid a circular dependency).
- `queueLatency.observe(seconds)` — computed from `step_runs.started_at - step_runs.next_run_at`
  in the worker after a successful claim.
- `workerActive` — set by the `/metrics` collector via a DB query:
  `SELECT COUNT(*) FROM step_runs WHERE status = 'RUNNING'`.
- `retryTotal.inc()` — called when `commitStepFailure` sets a step to `RETRYING`.
- `dlqDepth` — set by the `/metrics` collector:
  `SELECT COUNT(*) FROM step_runs WHERE status = 'DEAD_LETTERED'`.

### Route (`routes/metrics/index.ts`)

```ts
// No auth required — standard for Prometheus scraping
// In production, protect this with network policy or Basic Auth
app.get('/metrics', async (request, reply) => {
  // Refresh DB-backed gauges before serializing
  await refreshDbGauges(pool);

  const output = await metricsRegistry.metrics();
  reply.header('Content-Type', metricsRegistry.contentType);
  return reply.send(output);
});
```

### Grafana Provisioning

`docker/grafana/provisioning/datasources/prometheus.yaml`:
```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
```

`docker/grafana/dashboards/flowforge.json`:
A Grafana dashboard JSON with 5 panels, one per metric. Panel types:
- `flowforge_jobs_total` — Time series (rate)
- `flowforge_queue_latency_seconds` — Histogram (p50/p95/p99 quantiles)
- `flowforge_worker_active` — Stat panel
- `flowforge_retry_total` — Time series (rate)
- `flowforge_dlq_depth` — Stat panel (with alert threshold at > 0)

Prometheus `prometheus.yml` scrape config:
```yaml
scrape_configs:
  - job_name: flowforge
    static_configs:
      - targets: ['api:3000']
    metrics_path: /metrics
    scrape_interval: 15s
```

---

## npm Dependencies (api package)

```
prom-client
```

---

## Verification Checklist

- [ ] `curl http://localhost:3000/metrics` returns `Content-Type: text/plain; version=0.0.4`.
- [ ] Output contains all 5 metric names: `flowforge_jobs_total`,
      `flowforge_queue_latency_seconds`, `flowforge_worker_active`,
      `flowforge_retry_total`, `flowforge_dlq_depth`.
- [ ] After running a workflow: `flowforge_jobs_total{status="succeeded"}` > 0.
- [ ] `flowforge_queue_latency_seconds` has histogram buckets in the output.
- [ ] Grafana at `http://localhost:3001` shows all 5 panels in the FlowForge dashboard
      without errors.
- [ ] Prometheus at `http://localhost:9090/targets` shows `flowforge` target as `UP`.
- [ ] `tsc --noEmit` exits 0 on `packages/api`.
