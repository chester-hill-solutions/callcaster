# Thermo-Nuclear Code Quality Review

**Target:** the remediation proposed in issues #2215, #2216, #2219, #2220, and the three open PRs (#2221, #2222, #2223).

## First, an honest scoping note

The three PRs contain no application code. #2221 adds a 20-line `mise.toml`. #2222 adds enrichment JSON and regenerates a markdown file. #2223 adds two markdown documents. There is no implementation in them to review for spaghetti, abstraction quality, or file-size growth, and pretending otherwise would be theatre.

The real code-quality surface is the **fix I proposed inside the six issues**. A reviewer who approves my findings without auditing the shape of the suggested fix has approved half the work. So that is what this review is about.

**Verdict on the proposed fixes: approve three, reject one and demand a different shape.**

---

## Blockers

### 1. The #2219 fix as I wrote it is the wrong shape. There is a code-judo move that deletes the vulnerability instead of guarding it.

I proposed: add the rate limit, then require a valid invitation token in the `updateUser` branch. That is a **guard**, and it is correct as far as it goes. But it leaves the actual defect in place.

The defect is not "a branch forgot to check a token." The defect is the **dispatch shape**. `accept-invite.action.server.ts:225-234` routes on a raw form field:

```ts
if (actionType === "redeemInvitation") return redeemInvitationAction(ctx);
if (actionType === "resendInvitation")  return resendInvitationAction(ctx);
if (actionType === "updateUser")        return signUpAndClaimAction(ctx);
```

Each branch hand-parses its own fields and hand-enforces its own invariants. A security invariant enforced by "every branch remembers to" is not an invariant, it is a convention, and #2219 is the convention's first failure. Add the token check to `updateUser` and the fourth branch — or a form field that lands on the wrong branch — is the same bug again.

The judo move: **make the discriminator typed and make each variant's requirements part of its type**, so an unvalidated path is unrepresentable rather than merely unchecked.

Concretely, in the style the codebase already uses for JSON bodies:

```ts
const acceptInviteActionSchema = z.discriminatedUnion("actionType", [
  z.object({ actionType: z.literal("redeemInvitation"), token: z.string().min(1), invitationId: z.string().min(1) }),
  z.object({ actionType: z.literal("resendInvitation"), invitationId: z.string().min(1) }),
  z.object({ actionType: z.literal("updateUser"), email: z.email(), password: z.string().min(8), /* … */ }),
]);
```

Then `signUpAndClaimAction` has **no `token` in scope to read**. The bypass is not prevented by a check; it is prevented by the type. A future branch cannot skip validation because validation is how you get a value at all.

This deletes rather than adds: the `Object.fromEntries(formData.entries())` cast at `:116`, the four per-field `typeof` guards at `:124-138`, and the hand-rolled 405/error paths all collapse into one parse. It also makes the route honest about what it accepts, which it currently is not.

**The kicker:** `parseActionBody(request, schema)` at `app/lib/api-parse.server.ts:97` already exists for exactly this and is **used by zero routes** (see finding 3). So the canonical helper is right there, unused, and this is the one route that needs it. Adopting it here is not "invent a pattern," it is "start using the pattern that is already committed and paid for."

I should have proposed this in the issue rather than a two-step guard. That is a defect in my remediation, and amending #2219 is the right follow-up.

### 2. `#2220`'s proposed "add `enforceAuthRateLimit` to the two actions" perpetuates a split the codebase should not have.

I framed the two mechanisms as a wiring gap. Re-reading `app/lib/platform-auth-rate-limit.server.ts`, the two are fine in isolation — `rateLimitedPostAuth` (`:81-92`) is a thin wrapper over `enforceAuthRateLimit` (`:56-73`) that adds a 405 guard. No duplication. Good.

The problem is that **which mechanism a route uses is enforced by nothing**. Nothing in `check-handlers.mjs` requires a rate limit on an auth action. Nothing requires a form action to use the strategy form. The split is not even along a clean axis — `remember.action.server.ts` is an HTML route that uses the *strategy*, while `signin` and `two-factor` are HTML routes that use the *in-handler call*. So the pattern is neither "JSON vs HTML" nor "strategy vs handler"; it is arbitrary, and #2220 is the proof, because a reviewer reading five neighbours would correctly conclude one of the two was the convention.

Wiring the limiter into the two files I named makes the pass green and the trap intact. Someone adds a seventh auth action next year, copies the neighbour, and ships another unthrottled form.

The better remedy, and it is cheap: **fold `enforceAuthRateLimit` into the handler factory's default auth strategy** for auth-scoped actions, or add a guard to `check-handlers.mjs` that requires every action under `app/routes/api+/auth/` and the HTML auth forms to declare a rate-limited scope. The repo already has the pattern for this — 37 `&&`-chained gates in `ci:local`, and 25 `check:*` scripts. A gate that fails when a new auth action has no limiter closes the class. Two more one-line call sites do not.

I am not demanding the whole gate as part of #2220. I am saying the issue as I wrote it names the wrong fix, and should either widen to the guard or say explicitly that the guard is follow-up work, so the next person does not read "add the limiter" as the completion criterion.

---

## Approve, with one required change

### 3. Delete the speculative parse layer, or adopt it. Four of seven exports are unused by any route.

`app/lib/api-parse.server.ts` is 107 lines. Usage across `app/routes/`:

| Export | Routes | Tests referencing |
| --- | --- | --- |
| `parseJsonBody` | 30 | 7 |
| `parseJsonBodyOrResponse` | 30 | 7 |
| `parseSearchParams` | **0** | 1 |
| `parseActionBody` | **0** | **0** |
| `formatZodError` | **0** | 1 |
| `validationErrorResponse` | **0** | 1 |

Four exports have **zero** call sites in `app/routes/`, and three of those four are referenced only by a test of themselves. `parseActionBody` has no reference anywhere outside its own definition.

This is the skill's "abstraction that is not earning its keep" in its purest form: a form-body parsing convention was designed, exported, documented, and then no form ever adopted it — while the one route that most needed it (`accept-invite`) hand-rolled the same logic with a `Record<string, FormDataEntryValue>` cast (`:116`) and four `typeof` guards.

Two honest options, and the choice matters more than the effort:

- **Adopt.** Wire `parseActionBody` into `accept-invite` per finding 1, which retires the bespoke parse and gives the export a real caller. Then check whether the other three find one, and delete the ones that do not.
- **Delete.** Remove the four unused exports and let the JSON pair stand on its own. 26 lines of the file go away, and no one is worse off.

What is not acceptable is leaving them exported and unused. An unused export is a claim that the codebase has a form-parsing convention. It does not, and #2219 is the bill for that claim coming due.

### 4. `#2215`'s eight `ALTER TABLE`s — approve as written.

No objection. The eight tables are `uuid` on both sides, existing rows already carry valid ids, so the migration is additive and needs no data fix. The instruction to verify referential integrity *before* adding the constraint is the right one, and requiring the FK assertion as a test with an explicit kill-check is correct.

One thing to keep: the issue correctly routes the three `text` tables to the #2213 type-drift work instead of inviting a surrogate key. That is the "delete the complexity" instinct applied at the right place, and I want it preserved when the PR is written.

### 5. `#2216`'s Option A / Option B — approve, with the decision made explicit.

The defect is a half-removed security feature, and both options are honest: Option A makes the product correct, Option B makes the code honest. Flagging that Option A is the right *product* answer and that this is a decision, not a bug fix, is the correct framing.

The only thing missing: the issue does not say what Option A costs in signup friction, and that is the number the decision turns on. Add it, and do not let the smaller diff win by default.

---

## On the three PRs

No code-quality findings. Each is a single atomic concern, `ci:local` was green before push, the pre-commit `check:effects` gate ran on all three commits, and the board generator validated the JSON schema and `blockedBy` edges. `require-issue-reference` passes, which confirms the `no-issue` labels are being read rather than just set.

One note on #2222, not a code-quality blocker: the enrichment records embed two retractions (#2220's impact claim, and the correction inside the #2053-style record precedent). That is right, and it is worth keeping the habit — a triage record is read by the next person who picks the issue up, and they cannot reconstruct which claims were wrong.

---

## What I would change in my own work

Being direct about this, because the review is not useful if it only points outward:

1. **#2219 proposes a guard where a type would do.** The type-safe discriminator makes the bypass unrepresentable and deletes ~30 lines of bespoke parsing in the process. Amend the issue.
2. **#2220 names two call sites where a guard is needed.** Green now, same bug later. Either widen the issue to the `check-handlers` gate or state the gate as required follow-up.
3. **I did not notice the unused parse layer while filing.** I read `app/lib/api-parse.server.ts` while checking rate-limit mechanisms and did not count call sites. That single grep would have turned a guard into a judo move on the first pass. The missed check is the same class of error as the two I already corrected on the A2P claim — a grep scoped to the question instead of to the module.

## Priority order for follow-up

1. Amend #2219 to propose the typed discriminator + `parseActionBody`, not the two-step guard. **Blocking** — the issue as written will produce a correct-but-fragile fix.
2. Amend #2220 to require the `check-handlers` gate, or name it explicitly as follow-up work. **Blocking** for the same reason.
3. Decide the parse layer's fate: adopt into `accept-invite` (preferred, lands with #2219) or delete the four unused exports.
4. Add the signup-friction cost to #2216 so Option A can be decided on a number.

Items 1 and 2 are about my own issues, so they are cheap to do and should land before anyone picks them up off the board. Item 3 rides along with #2219. Item 4 is a paragraph.

---

## Evidence base

Read `app/routes/accept-invite.action.server.ts` (238 lines, in full), `app/lib/platform-auth-rate-limit.server.ts` (92 lines, in full), `app/lib/api-parse.server.ts` (107 lines, in full), `app/lib/schemas/api/platform-auth.ts`, and `scripts/check-handlers.mjs`. Counted call sites for every `api-parse` export across `app/routes/` and `test/` with `grep -rl` — that count is what finding 3 rests on, and it is reproducible. Grepped all 542 route modules for `formData.get("actionType")` to establish that the dispatch shape is confined to one route.

Ran `npm run ci:local` on the working tree: 37 chained gates green. Ran `npx tsc --noEmit` under Node 22: clean.

**Not verified:** I did not boot the application, did not execute `accept-invite` against a live database, and did not confirm the attack end to end. The #2219 exploit path is established by reading the dispatch and the Better Auth call, not by a proof-of-concept. That distinction should be preserved when the issue is amended — the *shape* of the fix is what this review establishes, and the exploit itself still deserves a live reproduction before the PR lands.
