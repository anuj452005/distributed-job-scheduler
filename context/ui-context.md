# UI Context

## Theme

Dark only. No light mode.

The design language is a dark technical workspace — near-black backgrounds,
layered surfaces with subtle elevation, and precise accent colors for
interactive elements and status states. The aesthetic is closer to a
monitoring terminal than a consumer product: dense, high-information,
unambiguous. Color is used purposefully for status, never decoratively.

Fonts are sharp and readable at small sizes. Monospace is used for IDs,
handler names, payloads, log lines, and any data that looks like code.

---

## Colors

All components must use these CSS custom property tokens. No hardcoded hex values anywhere in the codebase.

### Base Surfaces

| Role | CSS Variable | Hex | Notes |
|---|---|---|---|
| Page background | `--bg-base` | `#0a0c10` | Near-black. Canvas behind everything. |
| Surface (cards, panels) | `--bg-surface` | `#111318` | Primary card and panel background. |
| Surface raised (modals, dropdowns) | `--bg-surface-raised` | `#181c24` | Elevated above surface. Used for modals, popovers, context menus. |
| Surface hover | `--bg-surface-hover` | `#1e2330` | Row hover in tables, item hover in lists. |
| Surface active | `--bg-surface-active` | `#242a38` | Active/selected state. |
| Border default | `--border-default` | `#1f2535` | Panel borders, dividers, input borders. |
| Border subtle | `--border-subtle` | `#161b28` | Internal structure dividers — very faint. |
| Border strong | `--border-strong` | `#2e3650` | Emphasized borders, focused inputs. |

### Text

| Role | CSS Variable | Hex | Notes |
|---|---|---|---|
| Primary text | `--text-primary` | `#e8ecf4` | Main content, headings, values. |
| Secondary text | `--text-secondary` | `#8b95b0` | Labels, metadata, captions. |
| Muted text | `--text-muted` | `#4f5a74` | Timestamps, disabled states, placeholder text. |
| Inverse text | `--text-inverse` | `#0a0c10` | Text on bright accent backgrounds (e.g. active badge). |
| Mono text | `--text-mono` | `#c5cfe8` | Handler names, IDs, log lines, payloads — rendered in `--font-mono`. |

### Accent (Interactive)

| Role | CSS Variable | Hex | Notes |
|---|---|---|---|
| Primary accent | `--accent-primary` | `#4f7eff` | Primary buttons, links, focus rings, active nav items. Electric blue. |
| Accent hover | `--accent-primary-hover` | `#3d6ae6` | Primary button hover. |
| Accent subtle | `--accent-primary-subtle` | `#1a2a52` | Accent tinted surface — chip backgrounds, selected row tint. |
| Accent border | `--accent-primary-border` | `#2d4a99` | Border on accented elements. |

### Status Colors — Step States

These are used in the DAG graph, status badges, table rows, and log level indicators.
Every component that displays a `StepStatus` or `WorkflowStatus` must use exactly these tokens.

| Status | CSS Variable (text) | CSS Variable (background) | CSS Variable (border) | Hex (text) | Hex (bg) | Hex (border) |
|---|---|---|---|---|---|---|
| PENDING | `--state-pending-text` | `--state-pending-bg` | `--state-pending-border` | `#6b7a99` | `#131720` | `#1e2535` |
| QUEUED | `--state-queued-text` | `--state-queued-bg` | `--state-queued-border` | `#7c8fff` | `#141828` | `#2a3470` |
| RUNNING | `--state-running-text` | `--state-running-bg` | `--state-running-border` | `#38bdf8` | `#0d1f2d` | `#1a4060` |
| SUCCEEDED | `--state-succeeded-text` | `--state-succeeded-bg` | `--state-succeeded-border` | `#34d399` | `#0d2420` | `#1a4a38` |
| FAILED | `--state-failed-text` | `--state-failed-bg` | `--state-failed-border` | `#f87171` | `#2a1010` | `#6b2020` |
| RETRYING | `--state-retrying-text` | `--state-retrying-bg` | `--state-retrying-border` | `#fb923c` | `#251608` | `#6b3a10` |
| DEAD_LETTERED | `--state-dlq-text` | `--state-dlq-bg` | `--state-dlq-border` | `#e879f9` | `#200d25` | `#5c1a6b` |
| CANCELLED | `--state-cancelled-text` | `--state-cancelled-bg` | `--state-cancelled-border` | `#94a3b8` | `#141820` | `#2a2f40` |
| CANCEL_REQUESTED | `--state-cancel-req-text` | `--state-cancel-req-bg` | `--state-cancel-req-border` | `#fbbf24` | `#231a06` | `#6b4e10` |

### Log Level Colors

| Level | CSS Variable | Hex |
|---|---|---|
| DEBUG | `--log-debug` | `#4f5a74` |
| INFO | `--log-info` | `#38bdf8` |
| WARN | `--log-warn` | `#fbbf24` |
| ERROR | `--log-error` | `#f87171` |

### Destructive / Danger

| Role | CSS Variable | Hex |
|---|---|---|
| Danger text | `--danger-text` | `#f87171` |
| Danger background | `--danger-bg` | `#2a1010` |
| Danger border | `--danger-border` | `#6b2020` |
| Danger button | `--danger-action` | `#dc2626` |
| Danger button hover | `--danger-action-hover` | `#b91c1c` |

---

## Typography

| Role | Font | CSS Variable | Notes |
|---|---|---|---|
| UI text | Inter | `--font-sans` | Headings, labels, buttons, body text. Load from Google Fonts or Fontsource. |
| Monospace | JetBrains Mono | `--font-mono` | Handler names, step IDs, run IDs, payloads, log lines, SQL snippets. |

### Type Scale

| Role | Size | Weight | Line Height | CSS Variable |
|---|---|---|---|---|
| Page heading (h1) | `20px` | `600` | `1.3` | `--text-xl` |
| Section heading (h2) | `16px` | `600` | `1.4` | `--text-lg` |
| Card heading (h3) | `14px` | `500` | `1.4` | `--text-md` |
| Body / label | `13px` | `400` | `1.5` | `--text-sm` |
| Caption / metadata | `12px` | `400` | `1.5` | `--text-xs` |
| Mono / code | `12px` | `400` | `1.6` | Same size scale, `--font-mono` |

---

## Border Radius Scale

| Context | Value | CSS Variable |
|---|---|---|
| Badges, chips, inline tags | `4px` | `--radius-sm` |
| Buttons, inputs, small cards | `6px` | `--radius-md` |
| Panels, data cards, tables | `8px` | `--radius-lg` |
| Modals, drawers, large overlays | `10px` | `--radius-xl` |
| Circular avatars / icons | `9999px` | `--radius-full` |

---

## Component Library

Shadcn/ui on top of Tailwind CSS.

Components live in `packages/dashboard/components/ui/`.
Add new components using the shadcn CLI:

```
npx shadcn-ui@latest add <component-name>
```

Do not rewrite generated shadcn components from scratch.
Extend them by wrapping or composing — not by editing the generated file directly.

Shadcn components use CSS variables internally. Override the shadcn variable
mapping in `globals.css` to point to FlowForge tokens instead of shadcn defaults.

---

## Layout Patterns

- **App shell**: Full-viewport layout. Top navigation bar (48px, `--bg-surface`, bottom border `--border-default`). Left sidebar (240px fixed, `--bg-surface`, right border). Main content area fills the remaining space.
- **Workflow run detail**: Three-column layout. Left: step list with status badges (240px). Center: ReactFlow DAG canvas (flexible). Right: step detail drawer with logs (360px, slides in on step click).
- **Dashboard home**: Two-row grid. Top row: metric cards (queue depth, active workers, jobs/sec, DLQ count). Bottom row: recent workflow runs table with live status updates.
- **Sidebars**: Fixed width, separated from content by `1px solid var(--border-default)`. No shadows — use border separation only.
- **Modals**: Centered overlay with `backdrop-blur(4px)` on a `rgba(0,0,0,0.6)` backdrop. Max width `560px` for confirmation dialogs, `720px` for form modals.
- **Tables**: Full-width, row height `40px`, alternating row background using `--bg-surface` and `--bg-surface-hover`. Status column always on the right edge with a pill badge.
- **Log viewer**: Monospace font, `--font-mono`, 12px. Background `--bg-base`. Line-level color from log level tokens. Virtualized for performance (react-virtual or similar).

---

## DAG Graph (ReactFlow)

The workflow DAG is the centerpiece of the run detail view. Rules:

- Node background: `--state-{status}-bg` for the current `StepStatus`.
- Node border: `--state-{status}-border`, `1px solid`.
- Node label text: `--state-{status}-text`, `--font-mono`, `12px`.
- Node border radius: `--radius-md` (6px).
- Node size: `180px × 56px` minimum.
- Edge color: `--border-strong` for inactive edges. `--state-running-text` for the edge leading into a currently `RUNNING` node.
- Selected node: `box-shadow: 0 0 0 2px var(--accent-primary)`.
- Minimap background: `--bg-base`. Node colors: match node `--state-{status}-bg`.

---

## Icons

Lucide React. Stroke-based icons only. No filled icon variants.

| Context | Size class |
|---|---|
| Inline text icons | `h-3.5 w-3.5` |
| Button icons | `h-4 w-4` |
| Navigation icons | `h-4 w-4` |
| Empty state illustrations | `h-8 w-8` |
| Status indicator dot | Do not use an icon — use a `4px` circle `div` with `--state-{status}-text` color |

Stroke width: `1.5` (Lucide default). Do not override stroke width.
