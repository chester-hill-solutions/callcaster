# STICKYNOTES — callcaster

Idiosyncrasies, gotchas, and non-standard workflows discovered while working
in this repo. Check this before testing or working in an unfamiliar area;
add an entry the moment something costs you time to figure out. Keep entries
short — one or two lines. Prune entries that are confirmed stale/fixed.

## Environment & Setup
- [2026-08-06] dev is the real trunk, not master — master is the GitHub default but stale and still Supabase-era. Verify 'is this done?' against origin/dev.
- [2026-08-06] Local node version drifts from CI's 22 and can fake test failures — check node -v before trusting a local red run.
- [2026-08-06] Local Postgres/MinIO for manual DB work: docker-compose.dev.yml, Postgres on 127.0.0.1:5433, creds callcaster/callcaster. Docker Desktop often needs a manual 'open -a Docker' + wait before compose commands work.
- [2026-08-06] vendor/** source edits do nothing until you rebuild the committed dist — run npm run vendor:build.

## Testing & CI
- [2026-08-06] A fully green CI gate has coexisted with totally broken auto-dial + ACD — mocked db clients and scope-limited guards hide real DB bugs. Don't trust green alone for DB-touching changes.
- [2026-08-06] Two schema lineages exist (drizzle/baseline vs client/migrations) and can silently diverge. Verify with npm run db:schema:check + npm run check:db-rpcs (the latter needs no live DB and catches 'app calls an RPC no migration creates').
- [2026-08-06] db:ledger:check without DATABASE_URL only prints a repo inventory and compares nothing — looks green regardless of DB state. Pass --require-db to actually gate.
- [2026-08-06] Postgres call_status is an ENUM column — never COALESCE(status, '') it; cast to text first (COALESCE(enum, text_literal) fails type resolution, verified live).
- [2026-08-06] E2E DB bootstrap (scripts/db/bootstrap-fresh-db.mjs, scripts/e2e/bootstrap-compose-db.mjs) requires every client/migrations/*.sql file to be explicitly listed in its 'steps' or 'coveredByBaseline' array, or bootstrap fails loudly on a new migration.
- [2026-08-06] vi.mock inside a test body (not module scope) gets hoisted anyway and vitest warns it'll become a hard error — write it at module scope.

## Build & Deploy
- [2026-08-06] CI reads package-lock.json but both Dockerfiles read bun.lock — a dependency bump without 'bun install --lockfile-only' passes CI and dies on Railway build.
- [2026-08-06] railway.worker.toml is inert — Railway never reads it. Get restart policy/healthcheck/Dockerfile from the live service config, not the committed toml.
- [2026-08-06] Production runs the 'prod' branch, historically 200+ commits behind dev — a dev-only bug is not automatically a customer-facing bug. Say 'fixed on dev' vs 'shipped to prod' explicitly.

## Gotchas & Traps
- [2026-08-06] This working tree is shared with other live Claude sessions that stash/reset it mid-task. Commit each slice of work immediately — untracked new files survive a reset, uncommitted edits do not. Never git stash here.
- [2026-08-06] Repo is public — never put live infra state, secrets, or credentials in committed docs or PR bodies.
- [2026-08-06] The repo's top recurring bug class is a hand-maintained list (allowlist, route table, migration manifest, etc.) drifting from reality — when something 'should work' but doesn't, find the list before suspecting app logic.
- [2026-08-06] Test/demo data must use bland, neutral professional names — never cute or joke names.
- [2026-08-06] master is GitHub's designated default branch, not dev — a PR's 'Closes #NNNN' only auto-fires on merge to the actual default branch, so merging a PR into dev leaves the linked issue open even though the fix landed. Comment noting the merge instead of assuming auto-close.
- [2026-08-07] The Railway CLI (railway command) is pre-authenticated locally even when the Railway MCP server itself requires interactive OAuth — use 'railway logs <deploymentId> --service <id> --environment <id> --build/--deployment' to pull real deploy/build logs when a PR's Railway check goes red, instead of guessing from memory. Redeploy/mutating commands are still classifier-blocked without explicit user authorization.

