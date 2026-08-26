---
name: autoresearch
description: "Run the Karpathy-style metric-maximizing agent loop for CallCaster (or any repo): worktree + program-as-law harness, gate/metric entrypoints, cron batches with review→remediate. Use when the user wants to 'run autoresearch', start an overnight optimization run, or improve a metric automatically."
---

# Autoresearch Loop

The full contract lives in `autoresearch/program.md` in the autoresearch
worktree (`../callcaster-autoresearch`). That file is law; this skill is only
the pointer.

## When to use

- User asks to "run autoresearch", optimize a metric overnight, or start the loop.
- A repeatable metric (test time, bundle size, quality baselines) needs
  autonomous, measured improvement.

## Workflow

1. Ensure the worktree exists:
   `git worktree add ../callcaster-autoresearch -b autoresearch/<tag>`
   then `npm ci` and symlink `.env` (read-only) — see `autoresearch/README.md`.
2. Interactive kickoff: tell the agent
   `Read autoresearch/program.md and run setup for tag <tag>. Confirm, then go AFK.`
3. Unattended: copy `autoresearch/cron.env.example` → `cron.env`, set tag +
   models, then `bash autoresearch/install-cron.sh --interval 120`.
4. Morning review: read `autoresearch/results.tsv`, inspect kept commits on
   `autoresearch/<tag>`, run `npm run ci:local` once, cherry-pick wins into `dev`.

## Rules

- Never edit `program.md`, `rubric.md`, `gate.sh`, or `metric.sh` during a run.
- Never run baseline-update commands inside a run.
- The human merges to `dev`; the loop never does.
