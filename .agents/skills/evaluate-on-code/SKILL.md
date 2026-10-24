---
name: evaluate-on-code
description: Deep, cold evaluation of a product judged by its code only — never docs, marketing, or README as evidence. Returns a thesis, an idea rating, an execution rating, and a potential-for-market-adoption verdict. Use when the user asks to evaluate a product, rate a product or codebase as a business, assess market-adoption potential, or wants an honest "what did we actually build" verdict.
---

# Evaluate on Code

Evaluate a product using **code as the only evidence**. The output is a thesis,
two ratings, and a potential-for-market-adoption verdict. The tone is cold:
honest, plain, and free of encouragement.

Reference for writing style: [Google Technical Writing One and Two](https://developers.google.com/tech-writing).

## Prime directive

**Code only. Docs are out of scope for the judgment.**

The code is the witness. Everything else is noise or a claim you may optionally
stress-test — never a source of praise, narrative, or proof.

- **Do not** treat README, docs, ADRs, landing pages, marketing copy, blog posts,
  pitch decks, or commit messages as evidence of what the product is or how good
  it is.
- **Do not** quote or paraphrase docs in the thesis, ratings, or adoption
  verdict. If you never opened a markdown file outside the runnable app surface,
  that is correct.
- Optional claim check only: if the user asks you to compare claims to code, list
  claims briefly and mark each implemented / partial / absent with `file:line`.
  Claims never raise a score. Missing implementation is evidence of drift only.
- If code and any written claim disagree, the code wins. If there is no code for
  a claim, the claim is absent.
- When in doubt, open source, tests, configs, migrations, and running the binary
  — not documentation.

## Process

### 1. Inventory what the product is (from code and runtime only)

Build the ground truth before writing a word. Prefer entrypoints, routes,
schemas, jobs, and a live run over any prose:

- Entry points: what runs, who can reach it, what a first-time user can actually do.
- Core flows: trace the main job end to end (UI action → server → data → response).
- Data model: what the product remembers, which reveals what it values.
- Monetization: billing, payments, paywalls, plans. Note their absence plainly.
- Usage signals: analytics, logging of user behavior, retention features,
  notification loops. Note their absence plainly.
- Operability: tests, CI, deploys, monitoring, backups, rate limits, auth.
- Momentum: recency and shape of commits, if git history is available.

Run the product if it is cheap to run. A broken or unrunnable product is
execution evidence.

### 2. Optional: extract and test claims

Only if useful for drift reporting. List claims from outside the code (docs,
taglines, feature lists). For each, mark: implemented, partially implemented, or
absent — with `file:line` references. Do not use claim text as product
description in the final write-up.

### 3. Separate the audience from the admin

Distinguish code that serves end users from code that serves the builder
(admin panels, seeds, fixtures, dogfood tooling). A product whose richest
surface is its admin is a tool for its author, not a product.

### 4. Write the evaluation

Follow the output contract. Before returning, self-edit: delete every sentence
that neither changes the reader's mind nor adds evidence. Delete any sentence
that cites or depends on docs.

## Output contract

Return exactly these sections, in this order:

```markdown
## Thesis
<= 5 sentences, active voice: what this is, who it serves, what job it does,
and what it actually does today — inferred only from code and runtime.
No adjectives you cannot defend. No doc-derived positioning.

## Idea: N/10
2–4 sentences. Is the underlying problem worth solving, for someone willing
to pay? Judge the idea as revealed by what was built, not by marketing copy.

## Execution: N/10
2–4 sentences with `file:line` evidence. Judge the built thing: completeness,
correctness, states, security, operability. Judge the idea, not here.

## Potential for market adoption: <none | weak | emerging | strong>
2–4 sentences. Verdict first. Then evidence in the code that strangers could
discover, try, pay for, and return to the product — not whether PMF already
exists. Then what code evidence would raise the verdict.

## Evidence base
One short paragraph: what you inspected (repos, routes run, tests read) and
what you could not verify. State explicitly that docs were not used as evidence.
```

### Rating anchors

Use the anchors so ratings mean the same thing across products.

**Idea** — is the problem real, urgent, and paid for (as implied by the build):

- 9–10: buyers exist and pay today; the wedge is sharp; timing is now
- 7–8: real problem, plausible buyers, credible differentiation in a crowded field
- 5–6: real problem, weak differentiation, or unproven willingness to pay
- 3–4: niche problem, or a solution looking for one
- 1–2: no clear problem, or a solved commodity

**Execution** — is the built thing good:

- 9–10: a stranger could onboard today; states, security, and ops are handled
- 7–8: core flow works end to end; rough edges and missing states remain
- 5–6: core flow exists but is demo-grade (no billing, no states, thin security)
- 3–4: prototype; happy path only; correctness risks visible
- 1–2: non-functional, or a facade over nothing

**Potential for market adoption** — not "do we have PMF today." Ask: does the
code make adoption by a real market plausible?

Judge readiness for strangers to find value, complete the core job, pay or
commit, and come back — plus structural barriers (invite-only, single-tenant
hardcoding, missing onboarding, no multi-user model, no distribution surface).

- none: no path for an outsider to use or pay; builder-only surface; core job
  unreachable without tribal knowledge
- weak: a thin path exists (signup, install, or demo flow) but adoption blockers
  dominate — no retention loop, no clear buyer, single-user assumptions, or
  unfinished core job
- emerging: code supports a stranger completing the core job more than once;
  some monetization or distribution surface; major gaps remain
- strong: onboarding, core job, multi-user or multi-tenant reality, and
  pay/commit paths look built for a market — not proof of traction, proof the
  product is shaped for adoption

Do not equate "strong" with proven PMF. Traction is outside this skill unless it
appears as concrete usage/revenue machinery in the codebase you can cite.

## Honesty rules

- Verdicts first, reasons second. No compliment sandwiches.
- Every claim of quality or failure cites code (`file:line`) or observed behavior.
- Absence of evidence is evidence for rating purposes: no analytics means no
  usage signal; no billing means no revenue signal. Say so without apology.
- Judge idea and execution independently. Bad code does not sink a good idea;
  good code does not rescue a bad one.
- Do not speculate beyond the code. When the code cannot answer, write
  "no evidence either way" and move on.
- No hedging ("arguably", "somewhat", "it could be said"). Commit to the number.
- Never launder documentation into the evaluation ("the README says…", "per the
  docs…", "marketed as…") except in an optional claims-vs-code drift list.

## Writing rules (Google Technical Writing One/Two)

- Active voice. The product does things; code does things.
- Short sentences. One idea per sentence. Cut adverbs and intensifiers.
- Key points first: the thesis leads the document; each section leads with its verdict.
- One topic per paragraph; the first sentence carries the paragraph's point.
- Define terms on first use; use the same term for the same thing throughout.
- No ambiguous pronouns: write "this product", never "this" alone.
- Prefer lists and tables for parallel facts.
- No idioms, no hype words (game-changing, seamless, powerful, robust, modern,
  cutting-edge), no rhetorical questions.
- Numbers beat adjectives: "3 of 5 core flows have no error state" beats
  "error handling is lacking".
