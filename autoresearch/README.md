# Autoresearch (CallCaster)

Karpathy-style metric loop, modeled on BranchWeave's `auto-plan/`: the agent
forms one hypothesis per turn about how to improve one number, implements the
smallest slice that tests it, verifies with trusted entrypoints
(`gate.sh` + `metric.sh`), and keeps or discards by measurement. Small wins
compound overnight; everything else reverts.

You program the agent through Markdown (`program.md` is law). The agent runs
AFK until a hard stop.

## Layout

| File | Owner | Role |
|---|---|---|
| `program.md` | Human | Loop instructions — immutable during a run |
| `rubric.md` | Human | Mandatory gates + anti-gate + scored dimensions |
| `gate.sh` | Human | Trusted structural gate (~20 repo check scripts) |
| `metric.sh` | Human | Trusted measurement → JSON: typecheck/test/build seconds, bundle bytes, quality count |
| `notepad.md` | Agent (curated) | Durable validated observations |
| `whiteboard.md` | Agent (ephemeral) | Hypothesis queue and scratch |
| `cron-run.sh` / `install-cron.sh` / `cron.env.example` | Human | Unattended batches via `opencode run --auto`, flock-safe |
| `results.tsv`, `state.json`, `journal.jsonl`, `runs/` | Controller | Append-only evidence (gitignored) |

## The four metrics (lower is better)

1. `test_s` — wall time of `test:node && test:ui`
2. `typecheck_s` — wall time of `typecheck`
3. `bundle_bytes` — JS bytes in `build/client/assets`
4. `quality_count` — type-safety total + dry clones + effects count

Keep thresholds: ≥2% time win, ≥0.5% bytes, ≥1 quality count — with no sibling
regression past noise. Details in `program.md`.

## Kick off

```text
Read autoresearch/program.md and run setup for tag <tag>. Confirm, then go AFK.
```

## Human workflow

1. Iterate `program.md` / `rubric.md` between runs, never during.
2. Seed `whiteboard.md` with hypotheses before long AFK sessions if you like.
3. Work happens in worktree `../callcaster-autoresearch` on branch
   `autoresearch/<tag>` only.
4. Morning: read `results.tsv`, review kept commits, run `npm run ci:local`
   once, cherry-pick wins into `dev` yourself.

## Cron (unattended)

```bash
cp autoresearch/cron.env.example autoresearch/cron.env   # once; edit tag/models
bash autoresearch/install-cron.sh --interval 120         # every 2h
bash autoresearch/install-cron.sh --remove               # remove
```

- Overlap-safe via `flock`; logs in `autoresearch/runs/cron/`
- Batch lifecycle: BUILD (≤ MAX_TURNS kept turns) → REVIEW (independent model
  audits the batch diff against program/rubric) → REMEDIATE → PUSH branch only
- Never pushes `dev`/`main`

## Model economics

Default builder `x-preview-f-free` is free — pilot it first. Escalation path:
`claude-opus-5` (~$15–25/night, flat price to 1M ctx) for maximum kept-turn
reliability; reviewer `gpt-5.6-sol` ~$1/batch at 50% off until Sep 18 2026.

## Safety defaults

- Protected files hashed at setup; drift = hard stop
- No baseline-update commands, no config relaxations, no test deletion — see
  the Forbidden operations section of `program.md`
- Review→remediate rounds audit every batch before push
- Discard streak ≥5 stops the loop
