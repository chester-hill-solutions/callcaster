# Voice setup patch — 2026-10-08 (release PR pending)

This patch promotes [PR #2499](https://github.com/chester-hill-solutions/callcaster/pull/2499) for [#2498](https://github.com/chester-hill-solutions/callcaster/issues/2498), on tested dev `38fd063b4bfa1cbb52a80b2afb5f107c647a2981`. It changes the setup notice link. It adds no provider requests or data migration.

Run staging smoke checks before production. Use the user's existing production workspace with a complete pending-validation address to verify the notice. Do not submit address validation or rent a number for this check.

| Check | Expected result | Saved local proof / deployed acceptance |
| --- | --- | --- |
| Deployment | App and worker report SUCCESS at the exact merged release commit; `/readyz` returns 200 | Pending staging and production |
| Pending address | An owner or admin sees a linked “Continue workspace setup” title | Sixteen UI cases pass; pending deployed check |
| Keyboard navigation | Enter opens the same workspace's Numbers service-address section with the pending status and existing Edit/Validate controls | Real browser passed; do not activate provider controls |
| Layout | Notice, warning and following headings keep their positions and sizes at desktop and phone widths | Before/after bounds match at 1103×1028 and 390×844 |
| Other readiness states | Missing fields, invalid validation and validated address without usable voice retain the correct action; fully ready voice does not misroute another warning | Eleven real loader/readiness cases pass |
| Role controls | Members and callers keep the plain notice and existing permissions | Restricted-role UI controls pass; no new deployed privileged fixture |

Full local CI passed for the feature: 5,424 Node, 1,322 UI and 34 Bun tests, with eleven existing Node skips. The release candidate must pass full local CI, exact-head remote gates and app/worker previews before promotion. Record the merged commit and deployed results in the release PR.

Dependency manifests, both locks and npm configuration are unchanged from the public release. Existing holds on private upstream inventories, live provider traffic, privileged fixtures and credential changes remain outside this patch.
