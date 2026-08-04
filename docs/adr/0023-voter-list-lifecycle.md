# Voter list lifecycle

Contacts come from voter databases (Liberalist, VAN, Elections Canada voter lists). Lists have sources, import dates, and can be revoked or expired — party-controlled voter data access is temporary. The contact model tracks: `voter_list_source` (enum: liberalist/van/elections_canada/elections_ontario/manual/other), `voter_list_imported_at`, `voter_list_expires_at`, `voter_id` (the external voter file ID for cross-referencing). This is the domain reality: a campaign's access to voter data is granted by the party and can be revoked without notice (e.g., Noah's Liberalist access to Toronto-Danforth was revoked by Simon without warning). The Liberalist Virtual Phone Bank (VPB) is a separate calling workflow with a list + script + event coordination model that CallCaster's campaign + audience + script model maps to closely.

## References

- OKF second brain: `events/2026-05-28-...-noah-reports-that-simon-revoked-his-liberalist-access-for-to.md` (access revoked without notice)
- `crm-strategy-for-political-organizations.md` §3 (integration with voter file systems: NGP VAN, L2, Aristotle)
- `political-science-course/lesson-10-microtargeting-voter-models.md` (Liberal Party's Liberalist, National Register of Electors)
- `app/lib/database.types.ts` (current `contact` table has no voter-list-source tracking)
