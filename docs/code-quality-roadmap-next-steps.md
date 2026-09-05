# Code Quality Roadmap

## Purpose

This roadmap covers the product correctness and maintainability work found in
the recent thermo-nuclear review. CI load reduction has its own roadmap at
[`ci-load-reduction-next-steps.md`](./ci-load-reduction-next-steps.md).

## Delivery Rules

- Keep one logical concern per pull request.
- Preserve existing behavior unless a behavior change is explicitly listed.
- Put domain logic in the module that owns the domain concept.
- Prefer one canonical model over repeated local guards and projections.
- Add a regression test before or with every behavior fix.
- Run full `npm run ci:local` before every push or pull request.
- Do not commit the local `.gitignore` or `AGENTS.md` traveler changes unless separately requested.

## Current Status

Completed:

- E0.1: removed the unsafe unattended overnight runner from the worktree.
- E1.1: bounded SMS send-window deferrals in PR `#1388`.
- CI performance and load work: PRs `#1389`, `#1390`, and `#1391`.

Remaining high-priority work:

- Make issue-board pruning atomic.
- Fix theme-token contrast and test rendered toast states.
- Unify SMS and IVR schedule projection.
- Restore the SMS OpenAPI response contract.

## Roadmap Summary

| Epic | Goal | Priority | Effort |
|---|---|---:|---:|
| E2 | Make campaign scheduling one canonical model | P0 | 8 SP |
| E3 | Repair theme and accessibility ownership | P0/P1 | 13 SP |
| E4 | Make issue-board generation atomic | P1 | 3 SP |
| E5 | Restore public API contract | P1 | 2 SP |
| E6 | Remove weak type and invariant boundaries | P2 | 8 SP |
| E7 | Clarify shared-kit ownership and generated output | P1 | 2 SP |
| **Total** |  |  | **36 SP** |

Estimates include implementation, tests, review fixes, and the full local CI
gate. They exclude external package release time and CI queue time.

## E2: Canonical Campaign Schedule Model

**Goal:** Dispatch eligibility, next-open scheduling, SMS ETA, and IVR ETA use
the same time model.

### E2.1 Build the absolute-interval engine

**Priority:** P0  
**Effort:** 5 SP  
**Suggested PR:** `refactor(schedule): use one absolute interval projection`

Create a pure weekly schedule projector. It should produce absolute UTC
intervals from a schedule and a starting instant.

Required behavior:

- Include an overnight interval that started on the previous day.
- Handle week rollover.
- Handle multiple intervals per day.
- Handle overlapping intervals deterministically.
- Preserve unrestricted and empty schedules.
- Treat interval start and end boundaries consistently.

Use the projector for:

- Current send-window eligibility.
- Next send-window open time.
- Active-time consumption for ETA calculation.

Acceptance:

- `isWithinSendWindow`, `nextSendWindowOpenAt`, and ETA projection do not each walk the schedule independently.
- Overnight tests cover the previous-day tail.
- Boundary tests cover exact start, exact end, and midnight.
- Week rollover tests cover Sunday to Monday.
- The projector has no UI or database dependencies.

### E2.2 Add explicit SMS and IVR policy adapters

**Priority:** P0  

Keep the interval engine generic. Add explicit adapters for the different
business policies:

- SMS `sms_send_window`.
- IVR calling hours.
- IVR `start_date` and `end_date`.

Remove the `as Schedule` casts in
`app/components/campaign/settings/detailed/CampaignLaunchExtras.tsx`.

Acceptance:

- IVR ETA and IVR dispatch use the same IVR policy.
- SMS ETA and SMS dispatch use the same SMS policy.
- IVR dates appear in ETA behavior.
- Invalid or absent schedules have explicit typed behavior.
- No cross-policy schedule cast remains.

## E3: Theme and Accessibility Ownership

**Goal:** Semantic tones remain readable and test coverage exercises real
rendered states.

### E3.1 Separate surface and text tokens

**Priority:** P0  

Audit the shared `shad-cc` theme and application usages. Separate tokens for:

- Solid tone surfaces.
- Translucent washes.
- Tone icons and borders.
- Standalone text.

Known issues to fix:

- Dark-mode info toast text has insufficient contrast.
- Light-mode standalone `text-success` content has insufficient contrast.
- Surface foreground changes must not make badges or chips unreadable.

Acceptance:

- Normal text meets WCAG AA in both themes.
- Solid badges and buttons have readable foregrounds.
- `text-success`, `text-info`, `text-warning`, and `text-destructive` usages are audited.
- The canonical token names make surface-vs-text intent clear.

### E3.2 Exercise rendered accessibility states

**Priority:** P0  

Extend `e2e/specs/design-preview-a11y.spec.ts` to render the states changed by
the theme work.

Acceptance:

- Success, info, warning, and error toasts are opened before scanning.
- Light and dark root themes are asserted.
- Focused, selected, disabled, invalid, loading, and open states are covered.
- A contrast regression fails the test.
- Toast selectors are scoped so they cannot shadow unrelated alerts.

### E3.3 Remove the production design gallery

**Priority:** P1  

Move the gallery to the shared CHS UI-kit workbench, or isolate it to a
development/test build. Do not expose a test-only workbench to workspace users.

Acceptance:

- The production workspace route is removed or protected by an explicit internal capability.
- Duplicate checkbox and switch IDs are removed.
- Theme changes use the canonical theme provider.
- Light and dark previews do not mix root `dark:` utilities with light tokens.
- The replacement still supports the accessibility scans.

## E4: Atomic Issue-Board Generation

**Goal:** A failed board generation never mutates curated enrichment data.

### E4.1 Stage pruning and output writes

**Priority:** P1  

Refactor `scripts/generate-open-issues-board.mjs` so pruning is pure:

1. Read all enrichment files.
2. Validate original records.
3. Compute closed-record pruning in memory.
4. Validate surviving dependency edges.
5. Build the complete board.
6. Write temporary lane files and board output.
7. Rename outputs only after all validation succeeds.

Acceptance:

- Malformed records are reported and not deleted.
- Dangling `blockedBy` edges fail without partial writes.
- Successful runs remove closed records.
- A failure after pruning calculation leaves every tracked file unchanged.
- Tests cover malformed JSON, malformed records, dangling edges, and successful multi-file pruning.

## E5: Public API Contract

**Goal:** Runtime responses and generated API contracts cannot drift.

### E5.1 Document deferred SMS responses

**Priority:** P1  

Add explicit dispatched and deferred response variants to the integrator
OpenAPI schema. Document `deferred`, `reason`, and `nextOpenAt` if the field is
part of the supported API. Regenerate generated clients.

Acceptance:

- Runtime JSON matches OpenAPI.
- Generated types narrow dispatched and deferred variants safely.
- Contract tests cover both variants.
- `npm run ci:codegen:verify` passes.

## E6: Type and Invariant Boundaries

**Goal:** Remove defensive branches that exist only because upstream contracts
are weak.

### E6.1 Use a discriminated queue-action schema

**Priority:** P2  

Replace the `.refine()` action schema in
`app/lib/schemas/api/platform-data.ts` with a discriminated union. Require the
fields for each action variant at the request boundary.

Acceptance:

- `update_status` requires `status`.
- `add_contact_ids` requires non-empty `contact_ids`.
- `add_audience` requires `audience_id`.
- `remove` requires `all` or non-empty `ids`.
- The service switch narrows without casts or repeated presence checks.

### E6.2 Strengthen call-screen return types

**Priority:** P2  

Validate workspace, campaign, and audience data before constructing the result
from `getCallScreenData()`. Remove downstream checks for values already
guaranteed by that function.

Acceptance:

- Callers do not repeat guaranteed null checks.
- Error handling remains explicit.
- `as unknown as` is removed from the result construction where possible.
- Existing failure behavior is covered by tests.

### E6.3 Consolidate invariant helpers

**Priority:** P2  

Create one typed weekday accessor and one shared non-empty SQL combinator.
Remove copied `andConditions` implementations and impossible interval-index
guards.

Acceptance:

- One invariant has one failure policy.
- Empty SQL condition lists cannot pass the type boundary.
- Weekday indexing is total for `Date#getUTCDay()` values.
- Schedule comparison remains simple and bounded.

## E7: Shared UI-Kit Ownership

**Goal:** Source and generated component output have one clear owner.

### E7.1 Add source/dist drift verification

**Priority:** P1  

Decide whether the CHS monorepo or CallCaster owns the changed `shad-cc`
behavior. If generated output remains vendored here, add a deterministic build
and drift check.

Acceptance:

- A source edit without a matching dist update fails deterministically.
- Package-level tests cover changed component behavior.
- Ownership and sync instructions are documented.
- Generated output is not changed manually.

## Recommended Sequence

1. E4.1: stage issue-board pruning and writes.
2. E3.1 and E3.2: fix active contrast issues and test rendered states.
3. E2.1: build the canonical schedule interval engine.
4. E2.2: add SMS and IVR policy adapters.
5. E5.1: restore the deferred SMS API contract.
6. E3.3: remove the production design gallery.
7. E7.1: clarify shared-kit source and generated-output ownership.
8. E6.1 through E6.3: remove type and invariant debt.

## Definition Of Done

- [ ] Every epic item has a focused pull request.
- [ ] Every pull request passes full `npm run ci:local`.
- [ ] Every behavior change has a regression test that fails when the behavior is inverted.
- [ ] Dispatch and ETA logic share canonical schedule semantics.
- [ ] Runtime API responses match OpenAPI and generated types.
- [ ] Failed generators leave curated files unchanged.
- [ ] Production routes do not expose test-only workbenches.
- [ ] Theme tokens distinguish text from surfaces and pass both themes.
- [ ] Weak optional and cast-heavy boundaries are replaced with explicit contracts.
