# Domain-Driven ADRs from Political Science Analysis

## Context

Explored the OKF second brain (`~/WebProjects/okf-second-brain`) and mercury-backup political science knowledge base (`~/WebProjects/mercury-backup/knowledge/`) against the v2 architecture plan. The v2 plan is excellent infrastructure but was missing the domain model that makes CallCaster the obvious choice over CallFire for political campaigns.

## Key political science findings

From peer-reviewed field experiments (Gerber & Green, Analyst Institute, Yale ISPS, Hirvonen et al.):

1. **1-5 support scale is THE industry standard** — every VAN/NGP implementation uses it
2. **Three phases of field work** — ID → Persuasion → GOTV, each with different targets/scripts/metrics
3. **Household spillovers exceed 100% of direct effect** (Finnish nationwide RCT, Hirvonen 2024)
4. **Professional phone banks produce NULL effect** — only volunteer calls work (Gerber & Green 2000, replicated)
5. **Two-round calling triples the effect** (McNulty 2005)
6. **Robocalls have zero turnout effect** but useful for ID only
7. **P2P texting produced 8.3pp** — largest digital effect ever (Schein et al. 2018)
8. **Canadian compliance**: CASL (political exempt if non-commercial), PIPEDA, CRTC (robocall ID required)
9. **No Canadian field experiments exist** on digital voter contact — CallCaster could enable this research
10. **Contact rate benchmarks**: Phone 10-20%, canvassing 25-40%, 15-25 contacts/hour

## 5 domain-driven ADRs to add (0019-0023)

### ADR-0019: 1-5 support scale as typed disposition enum
Replace freeform disposition strings with the industry-standard 1-5 support scale: 1=Strong Support, 2=Lean Support, 3=Undecided/Persuadable, 4=Lean Opposition, 5=Strong Opposition. Optional sub-dispositions for granularity. Validated by decades of field experiments. Enables persuasion/GOTV targeting by support level.
- Trade-off: freeform flexibility vs. standardization that enables phase-based targeting
- References: `door-knocking-field-operations-best-practices.md` (Phase 1: Voter Identification, The Support Scale 1-5), `crm-strategy-for-political-organizations.md` (Voter Scoring Models)

### ADR-0020: Three-phase campaign model (ID/Persuasion/GOTV)
Add `phase` enum to campaign: `identification | persuasion | gotv`. Phase determines target universe (ID=all, Persuasion=3s, GOTV=1s+2s), script type, and success metric. Enforces "don't blend phases on a single turf" rule from field ops research. The `campaign` table already has `type` and `status` enums — adding `phase` is natural.
- Trade-off: simplicity of one-mode vs. correctness of three-mode (blending phases degrades data quality)
- References: `door-knocking-field-operations-best-practices.md` (§2: The Three Modes of Field Work)

### ADR-0021: Household as first-class domain entity
Promote household from boolean flag (`group_household_queue`) + client-side address grouping to a real domain entity. Scientifically validated as targeting unit: Finnish nationwide RCT found >100% spillover to untreated household members (Hirvonen et al. 2024). Household has: address, voters (typed contacts), do-not-knock flag, last-contacted-at. Call once, record outcomes per voter, mark household-level flags.
- Trade-off: individual precision vs. household efficiency (scientifically validated)
- References: `door-knocking-field-operations-best-practices.md` (mark household as do-not-knock), Hirvonen et al. (2024) household spillover finding, existing `campaign.group_household_queue` boolean, existing `dequeue_household` RPC

### ADR-0022: Typed voter contact results
Replace `outreach_attempt.result: Json` with typed fields: `support_level` (1-5 enum from ADR-0019), `volunteer_interest` (enum: yes/no/maybe), `lawn_sign` (boolean), `vote_by_mail` (boolean), `issue_tags` (text[] — healthcare/education/housing/crime/transit/economy), `membership_sold` (boolean), `callback_audit` (boolean). Issue tags feed persuasion mail, digital ads, volunteer recruitment. At least one issue tag per contact is the field ops standard.
- Trade-off: JSON flexibility vs. queryable typed fields that feed persuasion/GOTV targeting
- References: `door-knocking-field-operations-best-practices.md` (§4: Active Listening & Issue Tags, "Require at least one issue tag for every contact logged"), `crm-strategy-for-political-organizations.md` (Voter Segmentation), current `outreach_attempt.result: Json` in `app/lib/database.types.ts`

### ADR-0023: Voter list lifecycle
Contacts come from voter databases (Liberalist, VAN, Elections Canada voter lists). Lists have sources, import dates, and can be revoked/expired (Noah's Liberalist access to Toronto-Danforth was revoked without notice by Simon). The contact model tracks: `voter_list_source` (enum: liberalist/van/elections_canada/elections_ontario/manual/other), `voter_list_imported_at`, `voter_list_expires_at`, `voter_id` (the external voter file ID for cross-referencing). This is the domain reality: party-controlled voter data access is temporary.
- Trade-off: generic contacts vs. domain-aware voter list lifecycle
- References: OKF second brain event "Noah reports that Simon revoked his Liberalist access for Toronto Danforth without notice", `crm-strategy-for-political-organizations.md` (§3: integration with voter file systems NGP VAN, L2, Aristotle), current `contact` table has no voter-list-source tracking

## Documented as v2 outcomes/features (NOT ADRs)

- **P2P texting** — New product capability (8.3pp effect, largest digital effect). Build on v2 infrastructure. Not an architectural decision about existing structure.
- **Multi-round campaign sequences** — Implementation of three-phase model (ADR-0020). Round 2 targets round-1 commitments (McNulty 2005: triples effect). Feature, not ADR.
- **Canadian compliance (CASL/PIPEDA/CRTC)** — Constraint, not trade-off. "Must comply" has no rejected alternative. Document in CONTEXT.md, enforce in code (robocall caller ID, non-commercial GOTV texts, voter data handling).
- **Real-time field operations dashboard** — Feature built on pg-realtime (ADR-0005). Contact rate, turf completion, data sync rate, volunteer flake rate, ID→GOTV conversion.
- **Field director role** — Add `field_director` to `workspace_role` enum during Drizzle migration. Simple, not ADR-worthy.
- **chs ecosystem shared voter data layer** — Cross-app architecture depending on v2 completion in both CallCaster AND quick-canvass. Future direction, document as v2 outcome.
- **Callback audit workflow** — 5% callback audit to prevent data fabrication (field ops standard). Feature, not ADR. Built on typed results (ADR-0022).

## CONTEXT.md additions (domain glossary)

Add these terms to the CONTEXT.md glossary:

- **Voter**: A contact who is a registered elector. Has a support level (1-5), turnout propensity, and may belong to a household.
- **Household**: A group of voters at the same address. The unit of contact in political calling. Has do-not-knock flag and last-contacted-at.
- **Support Level**: 1-5 scale: 1=Strong Support, 2=Lean Support, 3=Undecided, 4=Lean Opposition, 5=Strong Opposition. Industry standard (VAN/NGP).
- **Campaign Phase**: ID (identify support level across full universe), Persuasion (move 3s toward support), GOTV (ensure 1s and 2s vote). Don't blend phases.
- **Issue Tag**: A topic label on a contact result (healthcare, education, housing, crime, transit). Feeds persuasion targeting and volunteer recruitment.
- **Voter List**: A contact list imported from a voter database (Liberalist, VAN, Elections Canada). Has a source, import date, and may expire/be revoked.
- **Liberalist**: The Liberal Party of Canada's voter database. Access is party-controlled and can be revoked.
- **GOTV**: Get Out The Vote — final 96 hours, targeting only identified supporters (1s and 2s). Logistical scripts: voting plan, ride offers, poll location.
- **E-day**: Election day. The most intense calling period. Real-time progress tracking critical.
- **Contact Rate**: Meaningful conversations ÷ attempts. Phone: 10-20%, canvassing: 25-40%.
- **Callback Audit**: 5% random sample of logged contacts verified by a different volunteer within 48 hours. Prevents data fabrication.
