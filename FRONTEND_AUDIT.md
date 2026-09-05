# Samvid — Frontend Audit

Audit of the existing frontend (client/), performed before any changes. The
backend contract is documented in `client/src/lib/types.ts`; the app runs in a
local demo mode when `VITE_API_BASE_URL` is not configured, and talks to a REST
backend at `{VITE_API_BASE_URL}/...` when it is.

## 1. Existing pages / routes (hand-rolled routing in `client/src/App.tsx`)

| Route | Page | Notes |
| --- | --- | --- |
| `/` | Landing (topbar, hero proof field, principles, footer, role modal) | Working |
| `/console/user` | User console — dashboard (my assets, identity scene, activity) | Working |
| `/console/user/create` | Create asset form (localStorage per-email store) | Working, demo-only |
| `/console/admin` | Admin console — dashboard | Working |
| `/console/admin/users` | User directory + revoke/restore access | Working |
| `/console/admin/roles` | Permission matrix (static) | Working |
| `/console/admin/assets` | Asset viewing + revoke/restore access | Working |
| `/console/admin/audit` | Audit logs (static rows + revoke events) | Working |
| `/console/auditor` | Auditor dashboard (read-only) | Working |
| `/console/auditor/assets` | Asset verification (static rows) | Working |
| `/console/auditor/audit` | Audit logs (static rows) | Working |
| `/console/auditor/blockchain` | Chain state (static rows) | Working |
| `/dashboard`, `/dashboard/identity`, `/identity`, `/did` | Owner identity console (IdentityScene + facts) | Working |

## 2. Existing functionality

- Editorial cream / dark-teal proof-field design system (CSS variables, mono +
  serif type system, responsive breakpoints, reduced-motion support).
- Interactive 3D IdentityScene (shield activation, orbit nodes, particles).
- Registration/login modal with role handoff; real `POST /auth/login` when a
  backend is configured; email-heuristic role fallback in local mode.
- Per-role console shells with role-scoped navigation.
- Local-mode asset creation, persisted per account email.
- Admin revoke/restore access with confirmation dialog and audit events
  (localStorage).
- Auditor read-only console (asset verification, audit logs, blockchain state).
- Responsive layouts (desktop / tablet / mobile) for all console surfaces.

## 3. Missing functionality

- **Manager console** — `MANAGER` exists in types/permissions and `auth.ts`
  maps it to `/console/manager`, but there is no route and the role picker
  filters Manager out entirely.
- **API client** — `lib/types.ts` documents the full REST contract (users,
  identities, assets, NFT records, grants, audit, blockchain, stats, auth) but
  nothing calls it except a raw login fetch. No users/assets/grants/audit/
  blockchain/stats endpoints are wired to any view.
- **User asset detail** — asset rows link to `/console/user/assets/:id`, which
  renders the dashboard (no detail, no NFT record, no verify/mint/transfer).
- **User access control** — no grant/revoke access UI for USER/MANAGER.
- **User audit trail** — "View all" → `/console/user/audit` renders the
  dashboard.
- **Identity editing** — "Edit identity" → `/did/create` renders the landing
  page.
- **Sign out** — no way to clear the session from any console.
- **Route protection / 404** — consoles render with no session check; unknown
  routes silently render the landing page (`pages/NotFound.tsx` is unused).
- **Blockchain status** — auditor blockchain view is hardcoded; no subtle
  network status surfaced in consoles.
- **Data wiring** — admin user/assets/audit views and auditor views use
  hardcoded arrays, not the documented contract.

## 4. Dead buttons / routes

| Trigger | Target | Result today |
| --- | --- | --- |
| Owner console sidebar "ACCESS CONTROL" | `/access` | Falls through to landing page |
| Owner console sidebar "ASSET OWNERSHIP" | `/asset` | Falls through to landing page |
| Owner console sidebar "AUDIT TRAIL" | `/audit` | Falls through to landing page |
| Owner console "Edit identity" | `/did/create` | Falls through to landing page |
| User nav "My Assets" | `/console/user/assets` | Renders user dashboard |
| User asset row chevron | `/console/user/assets/:id` | Renders user dashboard |
| User activity "View all" | `/console/user/audit` | Renders user dashboard |
| Manager role | `/console/manager` | No route; renders landing page |

## 5. Backend endpoints currently used

- `POST {VITE_API_BASE_URL}/auth/login` — login modal, only when
  `VITE_API_BASE_URL` is set.
- `/manus-storage/...` — Vite dev proxy for hero images; static only.
- The REST contract in `lib/types.ts` (users, identities, assets, grants,
  audit, blockchain, stats) is **documentation only** — not connected.

## 6. Unused / dead code

- `client/src/pages/Home.tsx` — template example page, never imported.
- `client/src/pages/NotFound.tsx` — never rendered (no fallback route).
- `client/src/const.ts` — `getLoginUrl` depends on unset env vars; unused.
- `client/src/contexts/ThemeContext.tsx`, `hooks/useMobile.tsx`,
  `hooks/useComposition.ts`, `hooks/usePersistFn.ts` — unused by the app.
- `client/src/components/Map.tsx`, `ManusDialog.tsx`, `ErrorBoundary.tsx` —
  unused by the app.
- `wouter`, 52 of 53 shadcn/ui primitives — installed, only `Button` used.