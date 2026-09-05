# Uncommitted changes audit (no `git add` yet)

## What changed vs. committed tree
- **Zero committed changes** to inspect. The repo is on `main`, clean against `origin/main`, and every application file is currently untracked.
- **Project root** still contains a real app (`tests/`, `todo.md`, `client/`, `server/`, `shared/`, `pnpm-lock.yaml`, `package.json` etc.), not just the empty Web App template.
- **New/untracked app files** present now:
  - `client/src/App.tsx`, `client/src/pages/Home.tsx`, `client/src/pages/NotFound.tsx`
  - `client/src/components/RoleConsole.tsx`, `client/src/components/IdentityScene.tsx`, `client/src/components/robot-hero.tsx`
  - `client/src/index.css`, `client/src/main.tsx`, `client/src/lib/*`, `client/src/contexts/*`, `client/src/hooks/*`, `client/src/const.ts`
  - `client/public/brand/samvid-logo.png`, `client/public/manus-storage/...`
  - `tests/smoke.test.tsx`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `components.json`, `FRONTEND_AUDIT.md`, `ideas.md` etc.

So the “uncommitted changes” footprint is essentially **the current worktree**. The meaningful review is therefore: does the current app implementation look correct, and does it have gaps or regressions vs. the audit notes in `FRONTEND_AUDIT.md`?

---

## Correctness findings (current implementation)

### 1. Branding string consistency is good, with one storage-key exception
- Visible copy is consistently **Samvid / SAMVID** in App.tsx, NotFound.tsx, RoleConsole.tsx, index.css, package.json.
- Domain/identity strings are consistently `@samvid.local` and `did:sv:` style handles in `client/src/lib/api.ts` and `client/src/lib/auth.ts`.
- **One deliberate exception that looks intentional but should be explicit in a commit message:**
  - localStorage keys are still `trustvault.session`, `trustvault.jwt`, `trustvault.pendingRegistration`, `trustvault.admin.revocations`, `trustvault.admin.revokeAudit`, `samvid.local.db`, `trustvault.account.<email>`.
  - If this is intentional (preserve existing user sessions/local data), say so. If it is leftover, it should be normalized before first commit.

### 2. Modern auth placeholders, not real auth yet
- `client/src/lib/auth.ts` still contains a `getSession()` / `clearSession()` / `buildSessionFromToken()` shape with JWT + localStorage + impersonation scaffolding, but the app UX currently runs on plain session localStorage.
- That is fine as a working frontend, but the file should either:
  - be trimmed to the shape the app actually uses, or
  - have a short note clarifying it is future-real-auth scaffolding, not current flow.
- Right now it is not obviously wrong, but it is easy for a future editor to wire the wrong “auth” path.

### 3. No obvious runtime breakages in the main flows
- Landing page has:
  - login modal + register flow with password validation
  - role picker that routes to per-role console
  - “Open console” action that is session-aware
  - Sign out in both topbar and console sidebar
- Consoles are wired to the seeded local fallback store in `lib/api.ts`:
  - User console: identity, access, assets, audit trail, identity edit page
  - Manager console: dashboard, access control, assets, audit trail
  - Admin console: user management with reversible revoke/restore + admin audit log
  - Auditor console: separate dashboard, asset verification, audit logs, blockchain view
- Unknown routes render the branded 404 page.

### 4. Logo usage looks correct
- `client/public/brand/samvid-logo.png` is the exact logo file and is referenced in:
  - topbar lockup
  - dashboard sidebar
  - console sidebars
  - 404 page
  - favicon
- The image is not recolored/cropped/redrawn by the app; it is used as provided.

---

## Gaps and “should verify before commit” items

### 1. Nit: old TrustVault section comment language still present in stylesheet
- `client/src/index.css` still contains comments such as:
  - `/* TrustVault scene integration: ... */`
  - `/* Dashboard identity surface: the TrustVault field ... */`
  - `/* USER console repair: the compact TrustVault core ... */`
  - `/* Auditor route separation: ... light TrustVault console language */`
- These are only comments, not a runtime issue, but they read as stale branding and should be cleaned up if this is now a Samvid product.

### 2. Possible stale asset filenames in code vs. actual public files
- App.tsx references `/manus-storage/trustvault-proof-field_2121ea41.png` and `/manus-storage/trustvault-orbit-accent_abc24278.png`.
- These may be correct as stored assets, but the filenames still contain `trustvault`, which is inconsistent with the rest of the brand. If those images are still used, either rename them on disk or acknowledge the mismatch explicitly.
- If they are decorative-only and the brand is fully Samvid now, the mismatch is minor but worth a decision.

### 3. Missing tests for the newly added flows
- Existing smoke test coverage is reportedly in `tests/smoke.test.tsx`.
- From the project state, the newer logic that should have dedicated tests (or at least smoke coverage) includes:
  - registration validation (password length + password/confirm mismatch)
  - pending-registration localStorage handoff to role selection
  - session create / clear / route changes on sign-in and sign-out
  - per-role routing and that each role console actually renders its expected shell/nav
  - 404 fallback for unknown routes
  - reversible admin revoke/restore UI state
- If those are already covered, great. If not, the current work is not yet test-protected for the new flows.

### 4. Favicon is a large hero logo, not an optimized favicon
- Current favicon is the full Samvid logo PNG. That works, but:
  - it may be heavier than necessary for a tab icon
  - it may not be the best visual at tiny sizes
- This is a polish issue, not a correctness issue. Worth a conscious choice before launch.

### 5. Environment / backend contract should be confirmed before claiming “complete”
- `client/src/lib/api.ts` carries a seeded local fallback store plus a typed API shape.
- Before treating this as finished, verify:
  - which endpoints are actually live on the backend right now
  - which console features are intentionally local-only vs. backend-backed
  - whether the demo identity/asset/audit data is acceptable as the frontend truth for now

---

## Suggested action list

1. **Decide the localStorage key policy** and make it explicit:
   - keep `trustvault.*` keys for session continuity, or rename to `samvid.*` everywhere and accept that existing local data/sessions will be reset.
2. **Clean up stale TrustVault comments** in `client/src/index.css` if branding is fully Samvid now.
3. **Decide on the `/manus-storage/` asset filenames** (keep, rename, or remove) so filenames match the brand.
4. **Confirm test coverage** for the new flows in `tests/smoke.test.tsx`; add missing smoke cases if any are absent.
5. **Pick a favicon strategy** (current logo, or a smaller/crisper variant).
6. **Write a short note** in `client/src/lib/auth.ts` clarifying whether it is active auth or future scaffolding.
7. **Before first commit**, diff the full worktree, confirm nothing is accidentally left as `trustvault` where it should be `samvid`, and ensure the app still builds/typechecks.

---

## Verification status
- Not re-run now. Before committing, I would re-run:
  - typecheck
  - the smoke test suite
  - a quick build/preview sanity check
