# Unit 07 — Dashboard Trigger Management UI

> **Phase**: Phase 0 — Trigger Subsystem  
> **System Boundary**: `packages/dashboard/` (React)  
> **Depends On**: Unit 06 (Trigger CRUD API), Unit 19 Phase 0 (existing dashboard foundation)

---

## What This Unit Builds

A trigger management section inside the existing dashboard that allows operators to:

1. View all triggers for a workflow.
2. Create new triggers (cron, webhook, or event) via a modal form.
3. Pause, resume, and disable triggers.
4. View the last 10 execution history entries for a trigger.
5. Copy webhook URLs and rotate webhook tokens.

**Visible result**: Navigating to a workflow detail page shows a "Triggers" tab. Operators can create, manage, and monitor all trigger types from the browser.

---

## Pages and Components

### Route

Add a Triggers tab to the existing workflow detail page (or route):

```
/workflows/:workflowId  →  Tabs: [Overview | Triggers | Runs | Settings]
```

### Component Tree

```
WorkflowDetailPage
  └── TriggerPanel
        ├── TriggerList
        │     └── TriggerRow (×N)
        │           ├── TriggerStatusBadge
        │           ├── TriggerTypeIcon
        │           └── TriggerActions (pause/resume/disable/view)
        ├── CreateTriggerModal
        │     ├── TriggerTypeSelector (cron | webhook | event)
        │     ├── CronTriggerForm
        │     ├── WebhookTriggerForm
        │     └── EventTriggerForm
        └── TriggerDetailDrawer
              ├── TriggerConfigView
              ├── WebhookUrlCopyBox (webhook only)
              └── TriggerExecutionHistory
```

---

## Files To Create

### [NEW] `packages/dashboard/src/pages/triggers/TriggerPanel.tsx`

The main container. Fetches trigger list and renders the create button and list:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { TriggerList } from './TriggerList';
import { CreateTriggerModal } from './CreateTriggerModal';
import { useState } from 'react';

interface Props { workflowId: string; }

export function TriggerPanel({ workflowId }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['triggers', workflowId],
    queryFn: () => apiClient.get(`/api/workflows/${workflowId}/triggers`).then(r => r.triggers),
  });

  const transition = useMutation({
    mutationFn: ({ triggerId, action }: { triggerId: string; action: 'pause' | 'resume' | 'disable' }) =>
      apiClient.post(`/api/triggers/${triggerId}/${action}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers', workflowId] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Triggers</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary"
        >
          + New Trigger
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading triggers...</p>
      ) : (
        <TriggerList
          triggers={data ?? []}
          onTransition={(triggerId, action) => transition.mutate({ triggerId, action })}
        />
      )}

      {showCreate && (
        <CreateTriggerModal
          workflowId={workflowId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['triggers', workflowId] });
          }}
        />
      )}
    </div>
  );
}
```

### [NEW] `packages/dashboard/src/pages/triggers/TriggerList.tsx`

```tsx
import { TriggerRow } from './TriggerRow';

interface Trigger {
  id: string;
  name: string;
  type: 'cron' | 'webhook' | 'event';
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  config: Record<string, string>;
  last_fired_at: string | null;
  next_fire_at: string | null;
}

interface Props {
  triggers: Trigger[];
  onTransition: (id: string, action: 'pause' | 'resume' | 'disable') => void;
}

export function TriggerList({ triggers, onTransition }: Props) {
  if (triggers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No triggers yet. Click "New Trigger" to automate this workflow.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border">
      {triggers.map(t => (
        <TriggerRow key={t.id} trigger={t} onTransition={onTransition} />
      ))}
    </div>
  );
}
```

### [NEW] `packages/dashboard/src/pages/triggers/TriggerRow.tsx`

Shows trigger name, type icon, status badge, last fired time, and action buttons:

```tsx
import { formatDistanceToNow } from 'date-fns';
import { TriggerStatusBadge } from './TriggerStatusBadge';

// ... component renders trigger name, type badge, last_fired_at relative time,
// and conditional action buttons:
// ACTIVE: [Pause] [Disable]
// PAUSED: [Resume] [Disable]
// DISABLED: [Delete] (calls DELETE endpoint)
```

### [NEW] `packages/dashboard/src/pages/triggers/CreateTriggerModal.tsx`

Modal with a three-way type selector (Cron / Webhook / Event) and conditional form fields:

- **Cron**: cron expression input + misfire policy dropdown + human-readable preview (e.g., "Every 5 minutes").
- **Webhook**: optional HMAC secret field. After creation, displays the full webhook URL with a copy button.
- **Event**: event type string input (e.g., `order.created`).

All forms use `react-hook-form` + Zod for client-side validation matching the API schema.

### [NEW] `packages/dashboard/src/pages/triggers/TriggerDetailDrawer.tsx`

Slide-in drawer (reuse the existing `StepDetailDrawer` pattern) that:
- Shows full trigger config.
- For webhooks: shows the full webhook URL `POST /api/webhooks/<token>` and a copy button.
- Shows last 10 execution history entries in a table (status badge, timestamp, run link).
- Shows error messages for FAILED executions.

### [NEW] `packages/dashboard/src/pages/triggers/TriggerStatusBadge.tsx`

```tsx
const STATUS_COLORS = {
  ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/30',
  PAUSED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  DISABLED: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
} as const;

export function TriggerStatusBadge({ status }: { status: keyof typeof STATUS_COLORS }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  );
}
```

---

## API Integration

All API calls go through the existing `apiClient` (or fetch wrapper) in the dashboard. Required endpoints from Unit 06:

| Dashboard Action | API Call |
|---|---|
| Load trigger list | `GET /api/workflows/:id/triggers` |
| Create trigger | `POST /api/workflows/:id/triggers` |
| Open detail drawer | `GET /api/triggers/:id` |
| Pause trigger | `POST /api/triggers/:id/pause` |
| Resume trigger | `POST /api/triggers/:id/resume` |
| Disable trigger | `POST /api/triggers/:id/disable` |
| Delete trigger | `DELETE /api/triggers/:id` |

---

## UX Notes

- **Webhook URL display**: After creating a webhook trigger, the modal should show the URL prominently with a copy button. The token is only accessible via the API config — the dashboard is the only place operators will see it in context.
- **Cron preview**: Use a lightweight cron descriptor library (e.g., `cronstrue`) to show a human-readable description of the cron expression as the operator types it.
- **Real-time status**: The trigger list should poll every 30 seconds (or use the global SSE stream) to refresh `last_fired_at`.

---

## Verification Checklist

- [ ] `npm run build` from `packages/dashboard/` exits 0 with no TypeScript errors
- [ ] Navigate to `/workflows/:id` — "Triggers" tab visible
- [ ] Click "+ New Trigger" → modal opens with type selector
- [ ] Select "Cron", enter `*/5 * * * *` → human-readable preview shows "Every 5 minutes"
- [ ] Submit → trigger appears in list with `ACTIVE` status badge
- [ ] Select "Webhook" → after creation, modal shows full webhook URL with copy button
- [ ] Select "Event", enter `order.created` → trigger created
- [ ] Click "Pause" on an ACTIVE trigger → badge updates to `PAUSED`
- [ ] Click "Resume" on a PAUSED trigger → badge returns to `ACTIVE`
- [ ] Click "Disable" → badge shows `DISABLED`, Pause/Resume buttons hidden
- [ ] Open detail drawer → see execution history table
- [ ] Viewer role: action buttons are hidden or disabled
