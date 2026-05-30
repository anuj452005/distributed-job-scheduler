# Unit 17 — Dashboard Shell & Auth

## What This Unit Builds

The React application skeleton: global styles, design tokens, Clerk sign-in
wall, authenticated app shell (top nav + sidebar), and the client-side
routing structure. No functional pages yet — just the chrome and the
auth gate.

**Done looks like:**
- Navigate to `http://localhost:5173` (or the Vite dev server URL).
- Unauthenticated: Clerk's sign-in component is rendered.
- After signing in: the app shell appears with a top nav bar (48px),
  a left sidebar (240px), and a main content area with a placeholder.
- Navigating to `/workflows`, `/runs`, `/settings` via the sidebar works
  (pages show a placeholder title).
- Sign-out redirects back to the sign-in page.

---

## Dependencies

- Unit 01 — `packages/dashboard` Vite + React + Tailwind + shadcn/ui scaffolded.
- Unit 11 — API server running (for Clerk publishable key).

---

## Files to Create / Modify

```
packages/dashboard/
├── src/
│   ├── main.tsx                      # React root, ClerkProvider, Router
│   ├── App.tsx                       # Route definitions
│   ├── styles/
│   │   └── globals.css               # Design tokens + shadcn overrides
│   ├── components/
│   │   ├── shell/
│   │   │   ├── AppShell.tsx          # authenticated layout wrapper
│   │   │   ├── TopNav.tsx            # 48px top bar
│   │   │   └── Sidebar.tsx           # 240px left sidebar with nav links
│   │   └── ui/                       # shadcn components (do not edit)
│   └── pages/
│       ├── SignInPage.tsx
│       ├── WorkflowsPage.tsx         # placeholder
│       ├── RunsPage.tsx              # placeholder
│       └── NotFoundPage.tsx
```

---

## Design Token Setup (`globals.css`)

This file is the authoritative source for all CSS custom properties.
Copy every token exactly from `ui-context.md` — base surfaces, text,
accent, status states, log level, and danger colors.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap');

:root {
  /* Base Surfaces */
  --bg-base:             #0a0c10;
  --bg-surface:          #111318;
  --bg-surface-raised:   #181c24;
  --bg-surface-hover:    #1e2330;
  --bg-surface-active:   #242a38;
  --border-default:      #1f2535;
  --border-subtle:       #161b28;
  --border-strong:       #2e3650;

  /* Text */
  --text-primary:        #e8ecf4;
  --text-secondary:      #8b95b0;
  --text-muted:          #4f5a74;
  --text-inverse:        #0a0c10;
  --text-mono:           #c5cfe8;

  /* Accent */
  --accent-primary:        #4f7eff;
  --accent-primary-hover:  #3d6ae6;
  --accent-primary-subtle: #1a2a52;
  --accent-primary-border: #2d4a99;

  /* Status — all 9 states */
  --state-pending-text:   #6b7a99; --state-pending-bg:   #131720; --state-pending-border:   #1e2535;
  --state-queued-text:    #7c8fff; --state-queued-bg:    #141828; --state-queued-border:    #2a3470;
  --state-running-text:   #38bdf8; --state-running-bg:   #0d1f2d; --state-running-border:   #1a4060;
  --state-succeeded-text: #34d399; --state-succeeded-bg: #0d2420; --state-succeeded-border: #1a4a38;
  --state-failed-text:    #f87171; --state-failed-bg:    #2a1010; --state-failed-border:    #6b2020;
  --state-retrying-text:  #fb923c; --state-retrying-bg:  #251608; --state-retrying-border:  #6b3a10;
  --state-dlq-text:       #e879f9; --state-dlq-bg:       #200d25; --state-dlq-border:       #5c1a6b;
  --state-cancelled-text: #94a3b8; --state-cancelled-bg: #141820; --state-cancelled-border: #2a2f40;
  --state-cancel-req-text:#fbbf24; --state-cancel-req-bg:#231a06; --state-cancel-req-border:#6b4e10;

  /* Log levels */
  --log-debug: #4f5a74;
  --log-info:  #38bdf8;
  --log-warn:  #fbbf24;
  --log-error: #f87171;

  /* Danger */
  --danger-text:         #f87171;
  --danger-bg:           #2a1010;
  --danger-border:       #6b2020;
  --danger-action:       #dc2626;
  --danger-action-hover: #b91c1c;

  /* Fonts */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Border radius */
  --radius-sm:   4px;
  --radius-md:   6px;
  --radius-lg:   8px;
  --radius-xl:   10px;
  --radius-full: 9999px;

  /* Type scale */
  --text-xl: 20px;
  --text-lg: 16px;
  --text-md: 14px;
  --text-sm: 13px;
  --text-xs: 12px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { background: var(--bg-base); color: var(--text-primary); font-family: var(--font-sans); }
```

Override shadcn CSS variables in this same file to map to FlowForge tokens.

---

## App Shell Layout

```
┌──────────────────────────────────────────────┐
│ TopNav (48px, --bg-surface, border-bottom)    │
├──────────┬───────────────────────────────────┤
│ Sidebar  │ Main content area                  │
│ (240px)  │ (fills remaining space, scrollable)│
│          │                                    │
│ - Dash   │ <Route-specific content>           │
│ - Wrkflw │                                    │
│ - Runs   │                                    │
│ - Logs   │                                    │
└──────────┴───────────────────────────────────┘
```

Use React Router v6 (`<Outlet />` pattern) for nested routes under the shell.

---

## Auth Integration

```tsx
// main.tsx
import { ClerkProvider } from '@clerk/react';

<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
  <RouterProvider router={router} />
</ClerkProvider>

// AppShell.tsx
import { useAuth, useUser, RedirectToSignIn } from '@clerk/react';

const { isSignedIn, isLoaded } = useAuth();
if (!isLoaded) return <Spinner />;
if (!isSignedIn) return <RedirectToSignIn />;
```

---

## npm Dependencies (dashboard)

```
@clerk/react
react-router-dom
lucide-react        (icons)
```

---

## Verification Checklist

- [ ] `npm run dev` in `packages/dashboard` starts the Vite server at `localhost:5173`.
- [ ] Unauthenticated visit → Clerk sign-in page renders.
- [ ] Sign in with a Clerk test account → app shell renders.
- [ ] TopNav is 48px, `--bg-surface` background, `--border-default` bottom border.
- [ ] Sidebar is 240px, shows nav links: Dashboard, Workflows, Runs.
- [ ] Nav links navigate to `/`, `/workflows`, `/runs` without page reload.
- [ ] Sign-out button in TopNav → redirects to sign-in.
- [ ] No hardcoded hex values in any component — all colors via CSS custom property tokens.
- [ ] `globals.css` contains ALL tokens from `ui-context.md`.
- [ ] `tsc --noEmit` exits 0 on `packages/dashboard`.
