# Release QA — 2026-10-08

The release PR and commit must be recorded after promotion. Run staging first, then production. Saved dev evidence is identified below; unperformed manual checks stay pending.

Public sign-in must pass all four mobile/desktop and light/dark hydration cases with no browser errors. Provider calls, SMS, rentals, role changes and checkout need approved existing fixtures. No provider traffic was sent to create acceptance evidence.

Both staging and production track master. Confirm their exact app and worker deployment commits after the release merge; run staging checks first, then production smoke checks. Local fixtures do not replace these results.

| Check | Expected result | Evidence / status |
| --- | --- | --- |
| Exact deployment | App and worker report SUCCESS at the release commit; /readyz returns 200 | Pending release |
| Public hydration | Stored light/dark theme and first paint at 375px/1280px; email field remains usable; no browser errors | Final PR #2489 preview: four cases passed; original Docker-context source fails all four; fixed Bun build passes all four |
| Migration and worker startup | Fresh bootstrap and upgrade complete; no missing import tables or worker startup errors | Full runtime/recovery PostgreSQL: 1,120 cases passed with no skips; fresh preview login returns 401 for invalid credentials; release deployment pending |
| Auth and tenant boundaries | Owner, admin and member can use permitted features; foreign upload access returns 404; foreign workspace access is denied; revoked access ends | Pending deployed QA |
| Workspace setup remedy | Missing emergency address has a keyboard action to the same workspace's real form; read-only users get no write action | Earlier browser and route checks passed; release check pending |
| Setup notices | Save success and error notices keep the page and scroll position fixed; long text clears navigation in light/dark and mobile/desktop views | Sai preview and four local viewport checks passed; release check pending |
| Import parsing | BOM, blank lines, headerless files and multiline Unicode cells retain original source positions; invalid UTF-8 fails before writes | Exact CSV regression and actual dev BOM/multiline Unicode/replay upload checks pass; release smoke pending |
| Import recovery | Retry and same-file re-upload preserve committed effects without duplicates, including no mapped phone; failure never reports success | Local real worker termination, lease and transaction controls passed; deployed check pending |
| Import report | Partial and terminal outcomes show exact landed rows; report stays tenant scoped, keeps source positions and escapes CSV formula cells | PR #2486 merged. Actual dev report API and download/replay/tenant controls pass; browser behavior and no-shift pass; complete no-error browser rerun waits for #1750 |
| Contact edits | Call-list membership and Other Data edits persist after reload | Verify promoted contact fix on release |
| Number purchase | Address-required numbers explain missing addresses before a provider create; valid address SID reaches purchase | Use approved staging provider fixture; no unapproved rental |
| Calling and messages | A QA workspace can complete its approved test call and message; provider callback, queue completion and opt-out controls agree | Requires approved test resources |
| Bulk warning override | Recipient-count and campaign warnings require an explicit confirmation; required permission and provider checks stay enforced | Verify the existing warning contract on release |
| Billing | Test checkout, callback and retry produce one ledger entry; terminal message segments and call debits agree | Use staging test-mode checkout; production smoke is read-only |
| Dependency fixes | Vue renderer, source-map offsets and tar long-path controls retain their rejection and valid-input cases on the frozen install | Local real-library controls, full gates and exact preview app/worker checks passed; default-branch advisory read remains separate |

Keep #2128, #1771, #1802 and #1803 open for their remaining scope. Do not treat the full dependency audit as clean: other findings remain. The stored multi-workspace Twilio verification and privileged-role fixture requirements remain distinct from synthetic local checks.
