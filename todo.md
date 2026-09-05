# Reversible Admin Access

## Auditor route separation

- [x] Inspect why Auditor routes repeat the same content.
- [x] Create distinct Auditor Dashboard, Asset Verification, Audit Logs, and Blockchain views.
- [x] Verify desktop and mobile Auditor routes.
- [x] Publish the Auditor console update.


## TrustVault naming cleanup

- [x] Replace remaining SAMVID and Guardian references in maintained source and design notes.
- [x] Verify no legacy branding remains in application source.
- [x] Build and preview the renamed TrustVault animation labels.
- [x] Publish the naming update.


- [x] Support both revoke and restore transitions for each Admin access target.
- [x] Add confirmation copy for both destructive and restorative actions.
- [x] Record Access Revoked and Access Restored events in Admin Audit Logs.
- [x] Improve the action column so buttons have consistent width, spacing, and readable labels.
- [x] Verify desktop and mobile User Management and Asset Viewing layouts.
- [x] Publish the reversible access update.


## Frontend audit + missing functionality

- [x] Write FRONTEND_AUDIT.md covering pages, functionality, missing features, dead routes, and backend usage.
- [x] Add a typed API client (lib/api.ts) for the documented REST contract with a seeded local fallback store.
- [x] Add the Manager console (dashboard, access control, assets, audit trail) and enable Manager in the role picker.
- [x] Implement user asset detail, My Assets, Access Control, Audit Trail, and Identity edit pages.
- [x] Fix dead links: /access, /asset, /audit, /did/create now route to real console views; unknown routes render 404.
- [x] Wire admin and auditor views to API data (users, assets, audit, blockchain status, transactions, stats).
- [x] Add sign-out to consoles and topbar, and a session-aware "Open console" action on the landing page.
- [x] Replace glowing status dots with subtle non-animated textual network status; flatten halo rings.
- [x] Verify typecheck passes (bun tsc -b --noEmit).
