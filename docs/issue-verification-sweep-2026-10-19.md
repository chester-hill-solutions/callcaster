# Issue verification sweep — 2026-10-19

## What went wrong

Two automated passes closed issues in this repository using the same evidence: **a commit
that mentioned the issue number had reached `master`**.

- A backlog sweep closed **94 issues** and moved each to `on-prod`.
- The 2026-10-19 release PR closed **17 more** through its closing keywords.

Both treated the repository's history as proof about the product. A commit can be merged,
released and still not fix the symptom a user reported. The project Status is how the
operator knows what is actually done, so a wrongly closed issue at `on-prod` is worse than
an open one: it hides work that was never done.

The operator found it by hand and reopened nine issues. This sweep verifies the rest.

## What the sweep does

Every issue the bot closed is re-checked against the code in `origin/master` — the branch
production runs. For each one a verdict is reached by reading the diff, finding the
mechanism, and deciding whether that mechanism resolves the symptom the issue reports.
No verdict is accepted without a `file:line` or a quoted diff hunk.

| Verdict | Meaning | Issue | Status |
|---|---|---|---|
| `VERIFIED`, machine-checkable | the code demonstrably implements the requested behaviour | closed | `on-dev` — the operator promotes to `on-prod` |
| `VERIFIED`, needs a person | the fix is in, but only a human can confirm the symptom is gone | reopened | `on-qa` |
| `PARTIAL` | the code addresses part of the symptom only | reopened | `In progress` |
| `NOT_FIXED` | nothing in `origin/master` addresses the symptom | reopened | `In progress` |

The bot never sets `on-prod`. The operator promotes by hand, so the `on-prod` population
only ever contains what they promoted. An issue that needs a physical test stays open at
`on-qa`, because a person has to finish the job. Every reopened issue carries a comment
with the verdict and the evidence.

The procedure is written down in
[`.agents/skills/issue-fix-verification/`](../.agents/skills/issue-fix-verification/) and
applied by [`.opencode/tools/apply-issue-verdicts.mjs`](../.opencode/tools/apply-issue-verdicts.mjs).

## The method

The audit set is the issues the bot closed, plus the issues that are closed but not at
`on-prod`, plus the nine the operator reopened by hand.

Candidates for each issue come from its timeline (cross-referenced pull requests) and from
the commits in `master` whose subject names the issue. **Those are hints, not proof.** A
release squash commit names eighteen issues and fixes eighteen unrelated things, so the
verifier has to narrow it to the mechanism.

Each issue was checked by reading the diff and the current tree. The check is not "does a
commit mention this issue" and not "is the commit an ancestor of master" — both of those
were the original mistake.

### Signals that are never proof

| Signal | Why it fails |
|---|---|
| `git log --grep="#N"` finds a commit | 28 of 29 issues in the original sweep had no commit citing them; the fix landed under a PR number |
| the commit is an ancestor of `master` | says the change shipped, not that it fixes anything |
| the pull request is titled `fix(#N)` | a claim, not evidence |
| the issue was closed by a release PR | releases close on a keyword, not on a check |

## The results

### The board, before and after

| Status | Before | After | What moved |
| --- | --- | --- | --- |
| `on-prod` | 573 | 564 | 9 wrongly-claimed issues left it |
| `on-dev` | 7 | 30 | 28 verified issues waiting for the operator to promote them, plus unfinished ones |
| `on-qa` | 29 | 19 | 16 issues that need a person to confirm them |
| `In progress` | 10 | 17 | the issues whose fix does not resolve the symptom |
| `Backlog` | 168 | 157 | the reopened ones |
| `tested-on-dev` | 2 | 2 | unchanged |

The board now has 198 open issues. It had 188 before the sweep. The reopen of 30
wrongly-closed issues is why: the sweep's closures were hiding work that was never done.

| Verdict | Issues | What it means |
| --- | --- | --- |
| `VERIFIED` | 122 | the code in `master` resolves the reported symptom |
| `VERIFIED, manual` | 15 | the fix is in `master`, but only a person can confirm the symptom is gone |
| `PARTIAL` | 4 | the code covers part of the symptom only |
| `PARTIAL, manual` | 4 | partly fixed, and the rest also needs a person |
| `NOT_FIXED, manual` | 3 | not fixed, and confirming it needs a person |
| `NOT_FIXED` | 2 | nothing in `master` resolves the symptom |

**150 issues checked. 122 verified by the code, 15 verified but needing a person, 13 not fully fixed.**

### The issues that were closed and should not have been

| Issue | Verdict | Status now | Why |
| --- | --- | --- | --- |
| [#100](https://github.com/chester-hill-solutions/callcaster/issues/100) | `PARTIAL` | `(not on board)` | the fix covers part of the symptom only |
| [#1165](https://github.com/chester-hill-solutions/callcaster/issues/1165) | `PARTIAL, manual` | `In progress` | the fix covers part of the symptom only |
| [#1717](https://github.com/chester-hill-solutions/callcaster/issues/1717) | `PARTIAL` | `In progress` | the fix covers part of the symptom only |
| [#1826](https://github.com/chester-hill-solutions/callcaster/issues/1826) | `NOT_FIXED, manual` | `In progress` | nothing in `master` resolves the symptom |
| [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829) | `NOT_FIXED, manual` | `In progress` | nothing in `master` resolves the symptom |
| [#1841](https://github.com/chester-hill-solutions/callcaster/issues/1841) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) | `PARTIAL, manual` | `In progress` | the fix covers part of the symptom only |
| [#1856](https://github.com/chester-hill-solutions/callcaster/issues/1856) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#1857](https://github.com/chester-hill-solutions/callcaster/issues/1857) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#1874](https://github.com/chester-hill-solutions/callcaster/issues/1874) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#1875](https://github.com/chester-hill-solutions/callcaster/issues/1875) | `PARTIAL` | `In progress` | the fix covers part of the symptom only |
| [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) | `NOT_FIXED, manual` | `In progress` | nothing in `master` resolves the symptom |
| [#1989](https://github.com/chester-hill-solutions/callcaster/issues/1989) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2015](https://github.com/chester-hill-solutions/callcaster/issues/2015) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2061](https://github.com/chester-hill-solutions/callcaster/issues/2061) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2075](https://github.com/chester-hill-solutions/callcaster/issues/2075) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2148](https://github.com/chester-hill-solutions/callcaster/issues/2148) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2268](https://github.com/chester-hill-solutions/callcaster/issues/2268) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2282](https://github.com/chester-hill-solutions/callcaster/issues/2282) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2396](https://github.com/chester-hill-solutions/callcaster/issues/2396) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2503](https://github.com/chester-hill-solutions/callcaster/issues/2503) | `PARTIAL, manual` | `In progress` | the fix covers part of the symptom only |
| [#2507](https://github.com/chester-hill-solutions/callcaster/issues/2507) | `NOT_FIXED` | `In progress` | nothing in `master` resolves the symptom |
| [#2512](https://github.com/chester-hill-solutions/callcaster/issues/2512) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2519](https://github.com/chester-hill-solutions/callcaster/issues/2519) | `PARTIAL, manual` | `on-qa` | the fix covers part of the symptom only |
| [#2524](https://github.com/chester-hill-solutions/callcaster/issues/2524) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2592](https://github.com/chester-hill-solutions/callcaster/issues/2592) | `VERIFIED, manual` | `on-qa` | the fix is in `master`, but only a person can confirm it |
| [#2684](https://github.com/chester-hill-solutions/callcaster/issues/2684) | `PARTIAL` | `In progress` | the fix covers part of the symptom only |
| [#2686](https://github.com/chester-hill-solutions/callcaster/issues/2686) | `NOT_FIXED` | `In progress` | nothing in `master` resolves the symptom |

### Verified, awaiting the operator's promotion to `on-prod`

28 issues are verified by the code and sit at `on-dev`. They are closed; the Status is the operator's to move.

[#1727](https://github.com/chester-hill-solutions/callcaster/issues/1727) · [#1788](https://github.com/chester-hill-solutions/callcaster/issues/1788) · [#1789](https://github.com/chester-hill-solutions/callcaster/issues/1789) · [#1790](https://github.com/chester-hill-solutions/callcaster/issues/1790) · [#1791](https://github.com/chester-hill-solutions/callcaster/issues/1791) · [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030) · [#2034](https://github.com/chester-hill-solutions/callcaster/issues/2034) · [#2045](https://github.com/chester-hill-solutions/callcaster/issues/2045) · [#2062](https://github.com/chester-hill-solutions/callcaster/issues/2062) · [#2306](https://github.com/chester-hill-solutions/callcaster/issues/2306) · [#2509](https://github.com/chester-hill-solutions/callcaster/issues/2509) · [#2510](https://github.com/chester-hill-solutions/callcaster/issues/2510) · [#2511](https://github.com/chester-hill-solutions/callcaster/issues/2511) · [#2513](https://github.com/chester-hill-solutions/callcaster/issues/2513) · [#2518](https://github.com/chester-hill-solutions/callcaster/issues/2518) · [#2522](https://github.com/chester-hill-solutions/callcaster/issues/2522) · [#2523](https://github.com/chester-hill-solutions/callcaster/issues/2523) · [#2532](https://github.com/chester-hill-solutions/callcaster/issues/2532) · [#2541](https://github.com/chester-hill-solutions/callcaster/issues/2541) · [#2551](https://github.com/chester-hill-solutions/callcaster/issues/2551) · [#2605](https://github.com/chester-hill-solutions/callcaster/issues/2605) · [#2678](https://github.com/chester-hill-solutions/callcaster/issues/2678) · [#2679](https://github.com/chester-hill-solutions/callcaster/issues/2679) · [#2680](https://github.com/chester-hill-solutions/callcaster/issues/2680) · [#2681](https://github.com/chester-hill-solutions/callcaster/issues/2681) · [#2682](https://github.com/chester-hill-solutions/callcaster/issues/2682) · [#2683](https://github.com/chester-hill-solutions/callcaster/issues/2683) · [#2685](https://github.com/chester-hill-solutions/callcaster/issues/2685)

### Only a person can confirm these

| Issue | Verdict | Status now | What the person has to check |
| --- | --- | --- | --- |
| [#1165](https://github.com/chester-hill-solutions/callcaster/issues/1165) | `PARTIAL` | `In progress` | scripts/local/prune-environment-twiml-apps.mjs:62-88 — the only code that calls Twilio delete (`client.applications(...).remove()` at :102), restricted to ephem |
| [#1826](https://github.com/chester-hill-solutions/callcaster/issues/1826) | `NOT_FIXED` | `In progress` | Nothing in origin/master provides a dev-environment PR acceptance suite: the only PR-level end-to-end gate is the local docker-compose Playwright run, and the T |
| [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829) | `NOT_FIXED` | `In progress` | No dedicated CallCaster-qa Twilio account exists and qa.callcaster.ca is not pointed at one: the QA Railway environment still copies the dev/shared Twilio crede |
| [#1841](https://github.com/chester-hill-solutions/callcaster/issues/1841) | `VERIFIED` | `on-qa` | The IVR prompt is now emitted inside the `<Gather>` element instead of as its sibling, so Twilio listens for DTMF while the prompt plays and a key press stops t |
| [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) | `PARTIAL` | `In progress` | COVERED — app/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep.tsx:183-198 — the sheet's status is derived from the number's live capability: `const  |
| [#1856](https://github.com/chester-hill-solutions/callcaster/issues/1856) | `VERIFIED` | `on-qa` | The `<Gather>` now requests speech only when the step actually maps a spoken answer (a `vx-any` option); a keypad-only menu sends `input="dtmf"`, so Twilio neve |
| [#1857](https://github.com/chester-hill-solutions/callcaster/issues/1857) | `VERIFIED` | `on-qa` | The IVR now carries a transition timestamp across the gather response so every next-block and next-page request logs how long it took to get from 'the key press |
| [#1874](https://github.com/chester-hill-solutions/callcaster/issues/1874) | `VERIFIED` | `on-qa` | The IVR launch estimate no longer projects the queue at the dial-start rate: it now computes a completion rate bounded by the concurrent-call limit over the ave |
| [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) | `NOT_FIXED` | `In progress` | Nothing in origin/master changes the Stripe receipt to say how many credits were bought: the Checkout Session still creates ONE line item with `quantity: 1` and |
| [#1989](https://github.com/chester-hill-solutions/callcaster/issues/1989) | `VERIFIED` | `on-qa` | The manual-dial path now sends Twilio's `recordingStatusCallback` to the canonical signed `/api/recording` endpoint with the `completed` event, and the campaign |
| [#2015](https://github.com/chester-hill-solutions/callcaster/issues/2015) | `VERIFIED` | `on-qa` | Sign-in failures are no longer collapsed into one generic message: the shared login helper maps Better Auth's known credential codes (and their expected status) |
| [#2061](https://github.com/chester-hill-solutions/callcaster/issues/2061) | `VERIFIED` | `on-qa` | Option B shipped: the shared Alert's default variant is now the neutral card surface (`bg-card text-card-foreground border-border`) instead of `border-brand-ter |
| [#2075](https://github.com/chester-hill-solutions/callcaster/issues/2075) | `VERIFIED` | `on-qa` | Deployed check (read-only, 2026-10-19): `GET https://callcaster.ca/api/auth/reset-password/faketoken123?callbackURL=https%3A%2F%2Fcallcaster.ca%2Freset-password |
| [#2148](https://github.com/chester-hill-solutions/callcaster/issues/2148) | `VERIFIED` | `on-qa` | The inbound IVR block route no longer renders audio with its own local handler: it delegates to the shared `renderIvrBlock`, which falls back through audioFile  |
| [#2268](https://github.com/chester-hill-solutions/callcaster/issues/2268) | `VERIFIED` | `on-qa` | An IVR `voicemail:{email}` target is now bound to the call before the recording TwiML is emitted — the first valid recipient wins and is stored in a workspace-s |
| [#2282](https://github.com/chester-hill-solutions/callcaster/issues/2282) | `VERIFIED` | `on-qa` | Brand registration is now gated on a prepared, submitted A2P Messaging Profile: `prepareA2pMessagingProfile` creates or recovers the `us_a2p_messaging_profile_i |
| [#2396](https://github.com/chester-hill-solutions/callcaster/issues/2396) | `VERIFIED` | `on-qa` | Predictive-machine playback is now a durable, leased operation row bound to workspace/call/attempt/campaign/actor/conference, so a signed replay polls the journ |
| [#2503](https://github.com/chester-hill-solutions/callcaster/issues/2503) | `PARTIAL` | `In progress` | Master removes the duplicated section headings on the campaign pages (the 'Setup' heading under the Setup/Content/Queue/Launch tab row, the 'Launch' section hea |
| [#2512](https://github.com/chester-hill-solutions/callcaster/issues/2512) | `VERIFIED` | `on-qa` | The chats list defaults to the hasReplied filter and renders a virtual row window: the loader and the hook both default the sort to hasReplied, the SQL and the  |
| [#2519](https://github.com/chester-hill-solutions/callcaster/issues/2519) | `PARTIAL` | `on-qa` | The call-in verification number is now platform data instead of an environment variable: a verification_number table holds the numbers, getActiveVerificationNum |
| [#2524](https://github.com/chester-hill-solutions/callcaster/issues/2524) | `VERIFIED` | `on-qa` | app/hooks/call/useCallAudioControls.ts:100-111 — the owned stream is released on cleanup: `useEffect(() => { if (!stream) return; return () => { stream.getTrack |
| [#2592](https://github.com/chester-hill-solutions/callcaster/issues/2592) | `VERIFIED` | `on-qa` | app/routes/api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts:108-117,231-232 — the live runtime: nextStep === "hangup" or "end" is terminal and an |

### Every issue checked

| Issue | Verdict | In `master` | State | Status |
| --- | --- | --- | --- | --- |
| [#3](https://github.com/chester-hill-solutions/callcaster/issues/3) | `VERIFIED` | yes | closed | `(not on board)` |
| [#100](https://github.com/chester-hill-solutions/callcaster/issues/100) | `PARTIAL` | yes | open | `(not on board)` |
| [#1165](https://github.com/chester-hill-solutions/callcaster/issues/1165) | `PARTIAL, manual` | yes | open | `In progress` |
| [#1234](https://github.com/chester-hill-solutions/callcaster/issues/1234) | `VERIFIED` | yes | closed | `on-prod` |
| [#1615](https://github.com/chester-hill-solutions/callcaster/issues/1615) | `VERIFIED` | yes | closed | `on-prod` |
| [#1717](https://github.com/chester-hill-solutions/callcaster/issues/1717) | `PARTIAL` | yes | open | `In progress` |
| [#1727](https://github.com/chester-hill-solutions/callcaster/issues/1727) | `VERIFIED` | yes | closed | `on-dev` |
| [#1770](https://github.com/chester-hill-solutions/callcaster/issues/1770) | `VERIFIED` | yes | closed | `on-prod` |
| [#1771](https://github.com/chester-hill-solutions/callcaster/issues/1771) | `VERIFIED` | yes | closed | `on-prod` |
| [#1788](https://github.com/chester-hill-solutions/callcaster/issues/1788) | `VERIFIED` | yes | closed | `on-dev` |
| [#1789](https://github.com/chester-hill-solutions/callcaster/issues/1789) | `VERIFIED` | yes | closed | `on-dev` |
| [#1790](https://github.com/chester-hill-solutions/callcaster/issues/1790) | `VERIFIED` | yes | closed | `on-dev` |
| [#1791](https://github.com/chester-hill-solutions/callcaster/issues/1791) | `VERIFIED` | yes | closed | `on-dev` |
| [#1792](https://github.com/chester-hill-solutions/callcaster/issues/1792) | `VERIFIED` | yes | closed | `on-prod` |
| [#1794](https://github.com/chester-hill-solutions/callcaster/issues/1794) | `VERIFIED` | yes | closed | `on-prod` |
| [#1826](https://github.com/chester-hill-solutions/callcaster/issues/1826) | `NOT_FIXED, manual` | no | open | `In progress` |
| [#1829](https://github.com/chester-hill-solutions/callcaster/issues/1829) | `NOT_FIXED, manual` | no | open | `In progress` |
| [#1841](https://github.com/chester-hill-solutions/callcaster/issues/1841) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#1846](https://github.com/chester-hill-solutions/callcaster/issues/1846) | `PARTIAL, manual` | yes | open | `In progress` |
| [#1856](https://github.com/chester-hill-solutions/callcaster/issues/1856) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#1857](https://github.com/chester-hill-solutions/callcaster/issues/1857) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#1874](https://github.com/chester-hill-solutions/callcaster/issues/1874) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#1875](https://github.com/chester-hill-solutions/callcaster/issues/1875) | `PARTIAL` | yes | open | `In progress` |
| [#1877](https://github.com/chester-hill-solutions/callcaster/issues/1877) | `VERIFIED` | yes | closed | `on-prod` |
| [#1888](https://github.com/chester-hill-solutions/callcaster/issues/1888) | `VERIFIED` | yes | closed | `on-prod` |
| [#1889](https://github.com/chester-hill-solutions/callcaster/issues/1889) | `VERIFIED` | yes | closed | `on-prod` |
| [#1981](https://github.com/chester-hill-solutions/callcaster/issues/1981) | `NOT_FIXED, manual` | no | open | `In progress` |
| [#1989](https://github.com/chester-hill-solutions/callcaster/issues/1989) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2015](https://github.com/chester-hill-solutions/callcaster/issues/2015) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2030](https://github.com/chester-hill-solutions/callcaster/issues/2030) | `VERIFIED` | yes | closed | `on-dev` |
| [#2034](https://github.com/chester-hill-solutions/callcaster/issues/2034) | `VERIFIED` | yes | closed | `on-dev` |
| [#2045](https://github.com/chester-hill-solutions/callcaster/issues/2045) | `VERIFIED` | yes | closed | `on-dev` |
| [#2048](https://github.com/chester-hill-solutions/callcaster/issues/2048) | `VERIFIED` | yes | closed | `on-prod` |
| [#2058](https://github.com/chester-hill-solutions/callcaster/issues/2058) | `VERIFIED` | yes | closed | `on-prod` |
| [#2061](https://github.com/chester-hill-solutions/callcaster/issues/2061) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2062](https://github.com/chester-hill-solutions/callcaster/issues/2062) | `VERIFIED` | yes | closed | `on-dev` |
| [#2075](https://github.com/chester-hill-solutions/callcaster/issues/2075) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2076](https://github.com/chester-hill-solutions/callcaster/issues/2076) | `VERIFIED` | yes | closed | `on-prod` |
| [#2077](https://github.com/chester-hill-solutions/callcaster/issues/2077) | `VERIFIED` | yes | closed | `on-prod` |
| [#2086](https://github.com/chester-hill-solutions/callcaster/issues/2086) | `VERIFIED` | yes | closed | `on-prod` |
| [#2087](https://github.com/chester-hill-solutions/callcaster/issues/2087) | `VERIFIED` | yes | closed | `on-prod` |
| [#2088](https://github.com/chester-hill-solutions/callcaster/issues/2088) | `VERIFIED` | yes | closed | `on-prod` |
| [#2089](https://github.com/chester-hill-solutions/callcaster/issues/2089) | `VERIFIED` | yes | closed | `on-prod` |
| [#2090](https://github.com/chester-hill-solutions/callcaster/issues/2090) | `VERIFIED` | yes | closed | `on-prod` |
| [#2091](https://github.com/chester-hill-solutions/callcaster/issues/2091) | `VERIFIED` | yes | closed | `on-prod` |
| [#2092](https://github.com/chester-hill-solutions/callcaster/issues/2092) | `VERIFIED` | yes | closed | `on-prod` |
| [#2093](https://github.com/chester-hill-solutions/callcaster/issues/2093) | `VERIFIED` | yes | closed | `on-prod` |
| [#2094](https://github.com/chester-hill-solutions/callcaster/issues/2094) | `VERIFIED` | yes | closed | `on-prod` |
| [#2096](https://github.com/chester-hill-solutions/callcaster/issues/2096) | `VERIFIED` | yes | closed | `on-prod` |
| [#2102](https://github.com/chester-hill-solutions/callcaster/issues/2102) | `VERIFIED` | yes | closed | `on-prod` |
| [#2103](https://github.com/chester-hill-solutions/callcaster/issues/2103) | `VERIFIED` | yes | closed | `on-prod` |
| [#2105](https://github.com/chester-hill-solutions/callcaster/issues/2105) | `VERIFIED` | yes | closed | `on-prod` |
| [#2107](https://github.com/chester-hill-solutions/callcaster/issues/2107) | `VERIFIED` | yes | closed | `on-prod` |
| [#2108](https://github.com/chester-hill-solutions/callcaster/issues/2108) | `VERIFIED` | yes | closed | `on-prod` |
| [#2110](https://github.com/chester-hill-solutions/callcaster/issues/2110) | `VERIFIED` | yes | closed | `on-prod` |
| [#2111](https://github.com/chester-hill-solutions/callcaster/issues/2111) | `VERIFIED` | yes | closed | `on-prod` |
| [#2112](https://github.com/chester-hill-solutions/callcaster/issues/2112) | `VERIFIED` | yes | closed | `on-prod` |
| [#2113](https://github.com/chester-hill-solutions/callcaster/issues/2113) | `VERIFIED` | yes | closed | `on-prod` |
| [#2114](https://github.com/chester-hill-solutions/callcaster/issues/2114) | `VERIFIED` | yes | closed | `on-prod` |
| [#2118](https://github.com/chester-hill-solutions/callcaster/issues/2118) | `VERIFIED` | yes | closed | `on-prod` |
| [#2119](https://github.com/chester-hill-solutions/callcaster/issues/2119) | `VERIFIED` | yes | closed | `on-prod` |
| [#2121](https://github.com/chester-hill-solutions/callcaster/issues/2121) | `VERIFIED` | yes | closed | `on-prod` |
| [#2122](https://github.com/chester-hill-solutions/callcaster/issues/2122) | `VERIFIED` | yes | closed | `on-prod` |
| [#2123](https://github.com/chester-hill-solutions/callcaster/issues/2123) | `VERIFIED` | yes | closed | `on-prod` |
| [#2125](https://github.com/chester-hill-solutions/callcaster/issues/2125) | `VERIFIED` | yes | closed | `on-prod` |
| [#2127](https://github.com/chester-hill-solutions/callcaster/issues/2127) | `VERIFIED` | yes | closed | `on-prod` |
| [#2128](https://github.com/chester-hill-solutions/callcaster/issues/2128) | `VERIFIED` | yes | closed | `on-prod` |
| [#2131](https://github.com/chester-hill-solutions/callcaster/issues/2131) | `VERIFIED` | yes | closed | `on-prod` |
| [#2132](https://github.com/chester-hill-solutions/callcaster/issues/2132) | `VERIFIED` | yes | closed | `on-prod` |
| [#2134](https://github.com/chester-hill-solutions/callcaster/issues/2134) | `VERIFIED` | yes | closed | `on-prod` |
| [#2136](https://github.com/chester-hill-solutions/callcaster/issues/2136) | `VERIFIED` | yes | closed | `on-prod` |
| [#2137](https://github.com/chester-hill-solutions/callcaster/issues/2137) | `VERIFIED` | yes | closed | `on-prod` |
| [#2138](https://github.com/chester-hill-solutions/callcaster/issues/2138) | `VERIFIED` | yes | closed | `on-prod` |
| [#2140](https://github.com/chester-hill-solutions/callcaster/issues/2140) | `VERIFIED` | yes | closed | `on-prod` |
| [#2141](https://github.com/chester-hill-solutions/callcaster/issues/2141) | `VERIFIED` | yes | closed | `on-prod` |
| [#2144](https://github.com/chester-hill-solutions/callcaster/issues/2144) | `VERIFIED` | yes | closed | `on-prod` |
| [#2145](https://github.com/chester-hill-solutions/callcaster/issues/2145) | `VERIFIED` | yes | closed | `on-prod` |
| [#2147](https://github.com/chester-hill-solutions/callcaster/issues/2147) | `VERIFIED` | yes | closed | `on-prod` |
| [#2148](https://github.com/chester-hill-solutions/callcaster/issues/2148) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2149](https://github.com/chester-hill-solutions/callcaster/issues/2149) | `VERIFIED` | yes | closed | `on-prod` |
| [#2150](https://github.com/chester-hill-solutions/callcaster/issues/2150) | `VERIFIED` | yes | closed | `on-prod` |
| [#2151](https://github.com/chester-hill-solutions/callcaster/issues/2151) | `VERIFIED` | yes | closed | `on-prod` |
| [#2155](https://github.com/chester-hill-solutions/callcaster/issues/2155) | `VERIFIED` | yes | closed | `on-prod` |
| [#2157](https://github.com/chester-hill-solutions/callcaster/issues/2157) | `VERIFIED` | yes | closed | `on-prod` |
| [#2166](https://github.com/chester-hill-solutions/callcaster/issues/2166) | `VERIFIED` | yes | closed | `on-prod` |
| [#2172](https://github.com/chester-hill-solutions/callcaster/issues/2172) | `VERIFIED` | yes | closed | `on-prod` |
| [#2174](https://github.com/chester-hill-solutions/callcaster/issues/2174) | `VERIFIED` | yes | closed | `on-prod` |
| [#2185](https://github.com/chester-hill-solutions/callcaster/issues/2185) | `VERIFIED` | yes | closed | `on-prod` |
| [#2187](https://github.com/chester-hill-solutions/callcaster/issues/2187) | `VERIFIED` | yes | closed | `on-prod` |
| [#2268](https://github.com/chester-hill-solutions/callcaster/issues/2268) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2269](https://github.com/chester-hill-solutions/callcaster/issues/2269) | `VERIFIED` | yes | closed | `on-prod` |
| [#2271](https://github.com/chester-hill-solutions/callcaster/issues/2271) | `VERIFIED` | yes | closed | `on-prod` |
| [#2282](https://github.com/chester-hill-solutions/callcaster/issues/2282) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2288](https://github.com/chester-hill-solutions/callcaster/issues/2288) | `VERIFIED` | yes | closed | `on-prod` |
| [#2294](https://github.com/chester-hill-solutions/callcaster/issues/2294) | `VERIFIED` | yes | closed | `on-prod` |
| [#2295](https://github.com/chester-hill-solutions/callcaster/issues/2295) | `VERIFIED` | yes | closed | `on-prod` |
| [#2306](https://github.com/chester-hill-solutions/callcaster/issues/2306) | `VERIFIED` | yes | closed | `on-dev` |
| [#2308](https://github.com/chester-hill-solutions/callcaster/issues/2308) | `VERIFIED` | yes | closed | `on-prod` |
| [#2317](https://github.com/chester-hill-solutions/callcaster/issues/2317) | `VERIFIED` | yes | closed | `on-prod` |
| [#2320](https://github.com/chester-hill-solutions/callcaster/issues/2320) | `VERIFIED` | yes | closed | `on-prod` |
| [#2348](https://github.com/chester-hill-solutions/callcaster/issues/2348) | `VERIFIED` | yes | closed | `on-prod` |
| [#2350](https://github.com/chester-hill-solutions/callcaster/issues/2350) | `VERIFIED` | yes | closed | `on-prod` |
| [#2354](https://github.com/chester-hill-solutions/callcaster/issues/2354) | `VERIFIED` | yes | closed | `on-prod` |
| [#2355](https://github.com/chester-hill-solutions/callcaster/issues/2355) | `VERIFIED` | yes | closed | `on-prod` |
| [#2396](https://github.com/chester-hill-solutions/callcaster/issues/2396) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2402](https://github.com/chester-hill-solutions/callcaster/issues/2402) | `VERIFIED` | yes | closed | `on-prod` |
| [#2412](https://github.com/chester-hill-solutions/callcaster/issues/2412) | `VERIFIED` | yes | closed | `on-prod` |
| [#2426](https://github.com/chester-hill-solutions/callcaster/issues/2426) | `VERIFIED` | yes | closed | `on-prod` |
| [#2455](https://github.com/chester-hill-solutions/callcaster/issues/2455) | `VERIFIED` | yes | closed | `on-prod` |
| [#2459](https://github.com/chester-hill-solutions/callcaster/issues/2459) | `VERIFIED` | yes | closed | `on-prod` |
| [#2469](https://github.com/chester-hill-solutions/callcaster/issues/2469) | `VERIFIED` | yes | closed | `on-prod` |
| [#2479](https://github.com/chester-hill-solutions/callcaster/issues/2479) | `VERIFIED` | yes | closed | `on-prod` |
| [#2503](https://github.com/chester-hill-solutions/callcaster/issues/2503) | `PARTIAL, manual` | yes | open | `In progress` |
| [#2507](https://github.com/chester-hill-solutions/callcaster/issues/2507) | `NOT_FIXED` | no | open | `In progress` |
| [#2509](https://github.com/chester-hill-solutions/callcaster/issues/2509) | `VERIFIED` | yes | closed | `on-dev` |
| [#2510](https://github.com/chester-hill-solutions/callcaster/issues/2510) | `VERIFIED` | yes | closed | `on-dev` |
| [#2511](https://github.com/chester-hill-solutions/callcaster/issues/2511) | `VERIFIED` | yes | closed | `on-dev` |
| [#2512](https://github.com/chester-hill-solutions/callcaster/issues/2512) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2513](https://github.com/chester-hill-solutions/callcaster/issues/2513) | `VERIFIED` | yes | closed | `on-dev` |
| [#2518](https://github.com/chester-hill-solutions/callcaster/issues/2518) | `VERIFIED` | yes | closed | `on-dev` |
| [#2519](https://github.com/chester-hill-solutions/callcaster/issues/2519) | `PARTIAL, manual` | yes | open | `on-qa` |
| [#2522](https://github.com/chester-hill-solutions/callcaster/issues/2522) | `VERIFIED` | yes | closed | `on-dev` |
| [#2523](https://github.com/chester-hill-solutions/callcaster/issues/2523) | `VERIFIED` | yes | closed | `on-dev` |
| [#2524](https://github.com/chester-hill-solutions/callcaster/issues/2524) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2532](https://github.com/chester-hill-solutions/callcaster/issues/2532) | `VERIFIED` | yes | closed | `on-dev` |
| [#2541](https://github.com/chester-hill-solutions/callcaster/issues/2541) | `VERIFIED` | yes | closed | `on-dev` |
| [#2551](https://github.com/chester-hill-solutions/callcaster/issues/2551) | `VERIFIED` | yes | closed | `on-dev` |
| [#2592](https://github.com/chester-hill-solutions/callcaster/issues/2592) | `VERIFIED, manual` | yes | open | `on-qa` |
| [#2605](https://github.com/chester-hill-solutions/callcaster/issues/2605) | `VERIFIED` | yes | closed | `on-dev` |
| [#2655](https://github.com/chester-hill-solutions/callcaster/issues/2655) | `VERIFIED` | yes | closed | `on-prod` |
| [#2678](https://github.com/chester-hill-solutions/callcaster/issues/2678) | `VERIFIED` | yes | closed | `on-dev` |
| [#2679](https://github.com/chester-hill-solutions/callcaster/issues/2679) | `VERIFIED` | yes | closed | `on-dev` |
| [#2680](https://github.com/chester-hill-solutions/callcaster/issues/2680) | `VERIFIED` | yes | closed | `on-dev` |
| [#2681](https://github.com/chester-hill-solutions/callcaster/issues/2681) | `VERIFIED` | yes | closed | `on-dev` |
| [#2682](https://github.com/chester-hill-solutions/callcaster/issues/2682) | `VERIFIED` | yes | closed | `on-dev` |
| [#2683](https://github.com/chester-hill-solutions/callcaster/issues/2683) | `VERIFIED` | yes | closed | `on-dev` |
| [#2684](https://github.com/chester-hill-solutions/callcaster/issues/2684) | `PARTIAL` | yes | open | `In progress` |
| [#2685](https://github.com/chester-hill-solutions/callcaster/issues/2685) | `VERIFIED` | yes | closed | `on-dev` |
| [#2686](https://github.com/chester-hill-solutions/callcaster/issues/2686) | `NOT_FIXED` | no | open | `In progress` |
| [#2702](https://github.com/chester-hill-solutions/callcaster/issues/2702) | `VERIFIED` | yes | closed | `on-prod` |
| [#2703](https://github.com/chester-hill-solutions/callcaster/issues/2703) | `VERIFIED` | yes | closed | `on-prod` |
| [#2704](https://github.com/chester-hill-solutions/callcaster/issues/2704) | `VERIFIED` | yes | closed | `on-prod` |
| [#2705](https://github.com/chester-hill-solutions/callcaster/issues/2705) | `VERIFIED` | yes | closed | `on-prod` |
| [#2706](https://github.com/chester-hill-solutions/callcaster/issues/2706) | `VERIFIED` | yes | closed | `on-prod` |
| [#2712](https://github.com/chester-hill-solutions/callcaster/issues/2712) | `VERIFIED` | yes | closed | `on-prod` |
| [#2714](https://github.com/chester-hill-solutions/callcaster/issues/2714) | `VERIFIED` | yes | closed | `on-prod` |
| [#2718](https://github.com/chester-hill-solutions/callcaster/issues/2718) | `VERIFIED` | yes | closed | `on-prod` |
| [#2719](https://github.com/chester-hill-solutions/callcaster/issues/2719) | `VERIFIED` | yes | closed | `on-prod` |
| [#2722](https://github.com/chester-hill-solutions/callcaster/issues/2722) | `VERIFIED` | yes | closed | `on-prod` |
| [#2724](https://github.com/chester-hill-solutions/callcaster/issues/2724) | `VERIFIED` | yes | closed | `on-prod` |

## What this changes in the tooling

- **`.agents/skills/issue-fix-verification/`** — the rule, the verdicts, the `manual` flag,
  and the close/reopen/Status rules.
- **`.opencode/tools/apply-issue-verdicts.mjs`** — applies a verdict set, dry run by
  default.
- **`scripts/generate-verification-enrichment.mjs`** — seeds the board records from the
  verdicts so a reopened issue says why it is still open.

The repository had no script that closed issues on the bad rule; the offending sweep was
ad-hoc. The rule is now written down, which is the only thing that stops it being
reinvented badly.

## One thing the sweep exposed in the automation

[`.github/workflows/issue-on-dev.yml`](../../.github/workflows/issue-on-dev.yml) carries this
comment:

> The release promotion keeps closing the issue on `master`, so "closed" still means "in
> production".

That is the assumption that broke. A release closes an issue through a closing keyword, so
"closed" means "a release mentioned this issue", not "this issue is fixed". The comment
describes a guarantee the workflow does not make.

## Still open

- **#1981** — the fix exists only on `origin/change-request/1981-credit-receipt-quantity`
  and was never promoted. The commit that *is* in master implements the rejected
  alternative.
- **#1846** — the wiring shipped, but the status it passes comes from a loader snapshot
  with no refresh path. The operator re-reported it on 2026-10-15, after the fix shipped.
- **#1165** — the report and both checks are in master, but the removal half only covers
  closed-preview TwiML Apps. The issue also asks for development and review environments.
