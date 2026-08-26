# Notepad — durable validated facts

Always re-read at turn start. Append dated entries only: measured, reproducible
observations with evidence paths. Never copy whiteboard scratch here.

## Seeded by human (2026-08-25)

- 2026-08-25 | env | `.env` here is a symlink to the main checkout's real file. Never write to it. | evidence: `ls -la .env` | confidence: certain
- 2026-08-25 | repo | Queue/completion logic treats `status = "dequeued"` or non-null `dequeued_at` as completed — do not "optimize" these checks away. | evidence: AGENTS.md learned facts | confidence: certain
- 2026-08-25 | repo | Tenant data access must go through `createTenantDb(workspaceId)`; direct `@/server/db` imports from routes are lint-banned. | evidence: AGENTS.md | confidence: certain
- 2026-08-25 | metrics | Baselines are referee data: `scripts/type-safety-baseline.json` (.total), `scripts/dry-baseline.json` (.clones), `scripts/effects-baseline.json` (values). Update commands are forbidden during runs. | confidence: certain
- 2026-08-25 | tooling | Node lives under nvm v24 dir; bun at ~/.bun/bin; opencode at ~/.opencode/bin. cron-run.sh handles PATH already. | confidence: certain
- 2026-08-26 | noise | Two baseline samples: test_s 350.1→347.9 (~±0.6%), typecheck_s 61.5→49.0 (~±10%), bundle_bytes Δ72 bytes (~0.001%), quality_count stable 328. Trust test_s/bundle/quality deltas; distrust typecheck deltas under ~8%. | evidence: autoresearch/runs/metrics-history.jsonl | confidence: high
- 2026-08-26 | baseline | Full metric pass costs ~8 min (typecheck 49s + tests 348s + build 58s) before gate time. Budget turns accordingly. | evidence: metrics-history.jsonl | confidence: high
