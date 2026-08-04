# Typed voter contact results

Replace `outreach_attempt.result: Json` with typed fields: `support_level` (1-5 enum from ADR-0019), `volunteer_interest` (enum: yes/no/maybe), `lawn_sign` (boolean), `vote_by_mail` (boolean), `issue_tags` (text[] — healthcare/education/housing/crime/transit/economy), `membership_sold` (boolean), `callback_audit` (boolean). Issue tags feed persuasion targeting, digital ad audiences, and volunteer recruitment. The field ops standard is at least one issue tag per contact — "a voter file with support scores but no issue tags is only half as valuable." Typed fields enable Drizzle queries for phase-based targeting (ADR-0020) and analytics dashboards without parsing JSON.

## References

- `door-knocking-field-operations-best-practices.md` §4 ("Require at least one issue tag for every contact logged")
- `crm-strategy-for-political-organizations.md` §2 (issue-based segmentation, microtargeting)
- `app/lib/database.types.ts` (`outreach_attempt.result: Json` — the amorphous blob being replaced)
