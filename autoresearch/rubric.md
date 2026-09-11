# Autoresearch Rubric

Mandatory gates. Any fail → the turn cannot be kept. Scored dimensions guide
which kept turns are worth promoting to `dev`.

## Mandatory gates (all required for KEEP)

1. `bash autoresearch/gate.sh` exits 0.
2. `bash autoresearch/metric.sh` completes and prints valid JSON.
3. Focus metric improves past its threshold (see program.md table).
4. No sibling metric regresses past noise: speeds +2% relative, bytes +0.5%
   relative, quality counters +0 absolute.
5. Scope: ≤ 8 files changed (soft cap), none on the MUST-NOT list.
6. Commit message format: `ar(<focus>): <hypothesis summary> <before>→<after>`.
7. No behavior change intended; if a user-visible change sneaks in, that is a
   BLOCK, not a keep.

## Anti-gate (any hit → automatic DISCARD even if numbers improved)

- Baseline-update commands executed during the turn.
- Deleted or skipped tests/fixtures/routes/features.
- Hand-edited generated surfaces without regeneration via official scripts.
- Config relaxations (eslint/tsconfig/vite/vitest) in the diff.
- Edits outside the approved worktree.

## Scored dimensions (record before/after when meaningful)

| Dimension | Question |
|---|---|
| Simplicity | Does the diff delete more than it adds? Reject clever complexity for tiny gains. |
| Convention fit | Does the code match repo AGENTS.md patterns (tenant-db access, route module split, UI kit usage)? |
| Risk containment | Would a reviewer approve this in isolation? Any timing/ordering dependence added? |
| Durability | Will the win survive dependency bumps, or is it pinned to incidental details? |

Score each 0–2 in the results row description when the turn is nontrivial.
Prefer keeps that score high on Simplicity over larger but fragile wins.
