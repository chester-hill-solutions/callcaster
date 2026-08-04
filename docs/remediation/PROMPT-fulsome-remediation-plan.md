# Prompt: Write a fulsome remediation plan from an audit

Paste the block below into a new agent chat after an audit (browser nitpick, thermo-nuclear review, static critical review, etc.). Fill the bracketed placeholders first.

---

```text
Create a fulsome remediation plan document for CallCaster from the audit below. Do not implement yet — plan only.

## Context to use

- Repo: CallCaster (React Router 8, tenant Drizzle, Railway review env)
- Read before writing: `AGENTS.md`, `docs/AGENT-PLATFORM-GUIDE.md`, and the closest existing plan under `docs/remediation/` for tone/structure (e.g. `e2e-nitpick-remediation-plan-2026-07-15.md` or `live-coaching-orchestrator-plan-2026-07-15.md` or `critical-review-orchestration-plan-2026-07-12.md`)
- Audit source: [canvas path / transcript / PR / commit range / env URL]
- Environment (if live): [review URL, workspace id, role, constraints like 0 credits / 2FA disabled]
- Already fixed / out of scope: [list]
- Companion artifacts: [canvas, agent transcript id]

## Audit findings (paste full inventory)

[PASTE findings: severity, symptoms, routes, suspected root causes, file paths if known]

## Output requirements

Write a markdown plan to:

`docs/remediation/<slug>-remediation-plan-YYYY-MM-DD.md`

Use today's date in the filename and header. Match this section structure unless a finding set clearly needs fewer waves:

1. **Header metadata** — date, prepared-from, environment, status (Open), links to companion artifacts
2. **Commander's intent** — 4–6 numbered outcomes; security/boundary before polish; say what this plan does *not* replace
3. **Key results / definition of done** — measurable KR table with verification method; secondary wave-2 results as a short list
4. **Methodology and limitations** — what was exercised, what was not, live infra mitigations / debt
5. **Already resolved** — closed items so agents do not re-fix
6. **Findings inventory** — P0/P1/P2/P3 with stable IDs (`SEC-…`, `JOURNEY-…`, `UX-…`, `A11Y-…`, `LOW-…`); each P0/P1 item needs: severity, routes, symptom, root cause, fix strategy, primary files
7. **Implementation waves** — Wave 0 infra if needed; Wave 1 blockers ordered A→F; Wave 2 polish batches; Wave 3 deferred nitpick. Exit criteria per wave.
8. **File touchpoint matrix** — finding → files → tests to add/update; call out server-only helpers that must *not* be swapped for client projections
9. **Test plan** — automated commands (`ci:local`, targeted tests) + manual review-env checklist + regression risks table
10. **Repository invariants** — short AGENTS.md reminder (tenant db, no secrets in responses, no `.env` edits, etc.)
11. **Suggested PR structure** — small stacked PRs with merge order
12. **Coverage matrix** — surface × status (OK / Open / Fixed)
13. **Out of scope**
14. **Open questions** — with a default if unanswered
15. **References**

## Quality bar

- Re-verify suspected root causes against current source before locking fix strategies (grep loaders, components, routes). Prefer file paths that exist today.
- Prefer concrete acceptance criteria ("`.data` must not contain `authToken`") over vague goals.
- Security and crash/journey blockers before a11y/copy polish.
- Do not invent findings not in the audit; mark unknowns as open questions.
- Do not start implementation, create todos for coding, or commit unless I explicitly ask after the plan lands.
- Keep the doc self-contained enough that a fresh agent can execute Wave 1 without the original chat.
```

---

## Shorter variant (when the audit canvas/transcript is already in context)

```text
Create a fulsome remediation plan from this audit session (canvas + transcript). Write `docs/remediation/<slug>-remediation-plan-YYYY-MM-DD.md` in the style of `docs/remediation/e2e-nitpick-remediation-plan-2026-07-15.md`: commander's intent, KR table, methodology/limitations, already-resolved, P0–P3 inventory with root cause + fix strategy, waves with exit criteria, file touchpoints, test plan, PR split, coverage matrix, open questions. Re-verify root causes against current code. Plan only — no implementation.
```
