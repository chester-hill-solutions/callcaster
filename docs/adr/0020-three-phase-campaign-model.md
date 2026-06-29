# Three-phase campaign model (ID/Persuasion/GOTV)

Add `phase` enum to campaign: `identification | persuasion | gotv`. Phase determines target universe (ID = full universe, Persuasion = 3s only, GOTV = 1s and 2s only), script type, and success metric. Enforces "don't blend phases on a single turf" — one of the most common mistakes in campaign management according to field ops research. The `campaign` table already has `type` and `status` enums; adding `phase` is natural. GOTV scripts are purely logistical (voting plan, ride offers, poll location) — not persuasion. Two-round calling (McNulty 2005: follow-up calls to committed voters triples the effect) is enabled by phase transitions: ID campaign → Persuasion campaign (targets 3s) → GOTV campaign (targets 1s+2s from ID results).

## References

- `door-knocking-field-operations-best-practices.md` §2 (The Three Modes of Field Work: "Blending these phases on a single turf is one of the most common mistakes in campaign management")
- `political-science-course/lesson-03-persuasion-vs-mobilization.md` (three-bucket segmentation), `lesson-05-phone-banking-text-banking.md` (two-round calling, McNulty 2005)
