# Sai QA issues — 2026-07-21

**Author:** sai-sy  
**Filed against:** Railway review (`callcaster-review-visual-asset-review`)  
**Working branch context:** `dev` + local WIP for #1080/#1078 (QC-aligned audience upload)  
**Walkthrough date:** 2026-07-21  
**Status:** #1083 leftovers closed; #1080/#1078 implemented locally (pending PR); #1076/#1077 deferred

---

## Goal

Work through Sai’s issues from 2026-07-21: confirm what #1083 already fixed, then ship #1080/#1078 by aligning audience upload with quick-canvass import processor patterns.

---

## Issue ledger

| Issue | Title | State | Status |
|------:|-------|-------|--------|
| [#1082](https://github.com/chester-hill-solutions/callcaster/issues/1082) | Onboarding blocks renting | CLOSED | Fixed in #1083 |
| [#1081](https://github.com/chester-hill-solutions/callcaster/issues/1081) | Number rental UI overlapping | CLOSED | Hardened in #1083 |
| [#1080](https://github.com/chester-hill-solutions/callcaster/issues/1080) | Unnamed audience when named | OPEN → close with PR | **Implemented** (loader preserve + H1 sync) |
| [#1079](https://github.com/chester-hill-solutions/callcaster/issues/1079) | CSV header invisible light mode | CLOSED | Fixed in #1083 |
| [#1078](https://github.com/chester-hill-solutions/callcaster/issues/1078) | 1-contact upload forever | OPEN → close with PR | **Implemented** (QC job + batch + poll) |
| [#1077](https://github.com/chester-hill-solutions/callcaster/issues/1077) | Better upload UI | OPEN | Deferred |
| [#1076](https://github.com/chester-hill-solutions/callcaster/issues/1076) | Program Details Page is Hell | OPEN | Deferred |
| [#1074](https://github.com/chester-hill-solutions/callcaster/issues/1074) / [#1075](https://github.com/chester-hill-solutions/callcaster/issues/1075) | Service address wizard | CLOSED | Fixed in #1083 |

---

## Already shipped (#1083)

PR: https://github.com/chester-hill-solutions/callcaster/pull/1083 — `b1f0c00a` on `dev`.

---

## #1080 / #1078 implementation (this pass)

### #1080

- `getAudienceDetailApi` always returns audience after row load; contacts failures set `contacts_error` only.
- Narrow contact SELECT; H1 `displayName` syncs with form `onNameChange`.
- Test: [`test/get-audience-detail-api.test.ts`](../../test/get-audience-detail-api.test.ts).

### #1078 (QC-aligned)

| Concern | CallCaster now | QC reference |
|---------|----------------|--------------|
| Batch size | `AUDIENCE_UPLOAD_CHUNK_SIZE = 40` | `BATCH = 40` |
| Progress throttle | `AUDIENCE_UPLOAD_PROGRESS_NOTIFY_MS = 2500` | `IMPORT_PROGRESS_NOTIFY_MS = 2500` |
| Small-upload delay | `audienceUploadChunkDelayMs(n) === 0` for `n ≤ 40` | No setTimeout in import loop |
| Execution | Local `enqueueJob({ type: "audience_upload", ... })` | `process-contact-import` job |
| Client poll | 5000ms | `PROCESSING_POLL_MS = 5000` |
| Job package | Local poller + [`jobqueue.adapter.server.ts`](../../app/lib/adapters/jobqueue.adapter.server.ts) — **not** published `@chester-hill-solutions/jobqueue` yet | QC jobs package |

**QC reference files:**  
`quick-canvass/app/server/run-client-import.server.ts`, `contact-import-job.server.ts`, `use-import-processing-revalidate-poll.ts`

**CallCaster files:**  
`audience-upload-process.server.ts`, `audience-upload.action.server.ts`, `audienceUploadHandler`, `AudienceUploader.tsx`, `shared/audience-upload.ts`

**Local runtime:** `nvm use 22` + `npm run dev` **and** `npm run worker` (no HTTP worker wake; poller picks up jobs).

---

## Deferred

| Issue | Notes |
|------:|-------|
| [#1076](https://github.com/chester-hill-solutions/callcaster/issues/1076) | Goal-scoped Program details copy/defaults |
| [#1077](https://github.com/chester-hill-solutions/callcaster/issues/1077) | Shared dropzone UI after perf path lands |

---

## Done when

- [x] Fixed issues from #1083 closed on GitHub
- [x] #1080 code + unit test (close issue with PR)
- [x] #1078 code + unit tests (close issue with PR)
- [x] #1076 / #1077 deferred comments
- [ ] PR opened / merged
