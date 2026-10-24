# Public survey response history — 21 October 2026

Assessment for [#2292](https://github.com/chester-hill-solutions/callcaster/issues/2292).

**Recommendation: do not run a repair on the inspected production database.**
At `2026-10-21 06:04:48 UTC`, it held no surveys, survey responses or answers.
There are no stored rows to select for a repair. This result does not establish
that older databases never held survey data or that no completion request failed.

## Inspected system

| Item                   | Verified value                                            |
| ---------------------- | --------------------------------------------------------- |
| Railway project        | CallCaster, `32b36c6c-5f3d-463b-8c7f-bbcd70351e8f`        |
| Environment            | production, `793b0ad1-0e4f-4bbe-a5a1-83e000123b92`        |
| App service            | callcaster, `6a2f20d9-ac0f-4e6f-a180-c8d13e0d34d2`        |
| Database service       | Postgres-jAO4, `3be68e59-2e6f-4dc8-a21b-b1c3f33ff7e4`     |
| Database name          | `railway`                                                 |
| Current app revision   | `91c4409b28321504eb07f169801542a61ed7d4a8`                |
| Current app deployment | `c07d197b-e959-45c7-a9e8-f5149e0f2965`, SUCCESS           |
| Snapshot               | `2026-10-21T06:04:48.190513Z`, repeatable read, read only |

The app's resolved internal database identity matched this database service
before the read. The connection used its public endpoint. Credentials and
respondent rows were not exported. The four inspected data relations have RLS
disabled; the inspection role can bypass RLS. The zero counts are not a result
of a tenant filter or hidden rows. The database enforced read-only transactions
and a 15-second statement limit.

## Deployment interval

The retained production records contain these source boundaries. Times are
Railway deployment **creation** times; they are not exact traffic switch times.
Historical records now have status REMOVED. Current status is SUCCESS.

| Record time (UTC)   | Revision                                   | Source finding                                                                                                                                  |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-20 20:24:34 | `445184849505a15830eefb0421006b4a0dc9219c` | Earlier control: answer route uses the submitted `resultId`.                                                                                    |
| 2026-08-21 01:17:03 | `a5ba8d5f3c3cd39229335ab59007ba98f94df811` | First retained record with the confirmed defect: a missing token creates a new server identity; the page loader does not supply a signed token. |
| 2026-09-21 23:06:39 | `e3a1f002561d9aa7064504d51b930b99148b19c4` | Last pre-fix record before the October replacement; the shared guard still creates an identity for each tokenless request.                      |
| 2026-10-08 04:54:50 | `0a2b483bf03c952712f9a14f484a8d2600ea8430` | First retained record with the fix: missing tokens are rejected; the page supplies and resumes a signed identity.                               |
| 2026-10-19 17:49:54 | `91c4409b28321504eb07f169801542a61ed7d4a8` | Current successful production deployment contains the fix.                                                                                      |

The potential exposure is between the August 21 pre-fix deployment and the
October 8 replacement. Intermediate retained records also contain the defect.
The list does not prove a request count, exact activation time or which older
database each historic deployment used.

The pre-fix [answer route](https://github.com/chester-hill-solutions/callcaster/blob/a5ba8d5f3c3cd39229335ab59007ba98f94df811/app/routes/api%2B/survey-answer.action.server.ts#L39)
creates a new identity when the token is absent. The
[page loader](https://github.com/chester-hill-solutions/callcaster/blob/a5ba8d5f3c3cd39229335ab59007ba98f94df811/app/routes/survey%2B/%24surveyId.loader.server.ts#L54)
returns a client result ID without a signed token. The later
[completion function](https://github.com/chester-hill-solutions/callcaster/blob/e3a1f002561d9aa7064504d51b930b99148b19c4/app/lib/survey-db.server.ts#L623)
can report success after an update matches no response. The
[fixed guard](https://github.com/chester-hill-solutions/callcaster/blob/0a2b483bf03c952712f9a14f484a8d2600ea8430/app/lib/survey-public-action.server.ts#L48)
rejects a missing token. [PR #2293](https://github.com/chester-hill-solutions/callcaster/pull/2293)
contains the separate source fix.

## Aggregate result

The [query](2292-survey-response-history.sql) returns counts and schema access
flags. It does not return respondent IDs, contact details, answer values or
individual timestamps.

| Production measure                                          |     Count |
| ----------------------------------------------------------- | --------: |
| Surveys / active surveys                                    |     0 / 0 |
| Responses / answers                                         |     0 / 0 |
| Anonymous responses / answers / recorded completions        | 0 / 0 / 0 |
| Contact-backed responses / answers / recorded completions   | 0 / 0 / 0 |
| Unlinked-contact responses / answers / recorded completions | 0 / 0 / 0 |
| Zero-answer response rows                                   |         0 |
| Incomplete single-answer rows on multi-question surveys     |         0 |
| Repeated survey/contact groups                              |         0 |
| Orphan answers / responses without a survey                 |     0 / 0 |

The first and last response dates are NULL. There is no stored response interval
to intersect with the deployment interval.

**Unmatched completion requests are unknown.** A request that updated no row
left no response to count. An empty response table cannot prove that no such
request occurred. This read did not inspect legacy Supabase databases, deleted
rows, backups or request logs.

## Identity controls and limits

The same aggregate query also processes six synthetic rows supplied with
`VALUES`. These are query inputs only; they are never inserted into a table.

| Synthetic case                              | Responses | Answers | Recorded completions | Repeated contact groups | Ambiguous partial rows |
| ------------------------------------------- | --------: | ------: | -------------------: | ----------------------: | ---------------------: |
| Two complete attempts by the same contact   |         2 |       4 |                    2 |                       1 |                      0 |
| Two separate anonymous visits               |         2 |       4 |                    2 |                       0 |                      0 |
| Two incomplete attempts by the same contact |         2 |       2 |                    0 |                       1 |                      2 |

All controls passed. A repeated contact group occurs for legitimate complete
attempts as well as for ambiguous partial attempts. It is not proof of a broken
visit. A contact link is a database association, not a browser visit identity.
Anonymous responses have no contact identity to join. Timing and a matching
survey cannot establish that two rows belong to one visit.

No repair task is justified for this snapshot. If a separate historical data
source is later supplied, inspect its environment, revision interval and
aggregate populations first. Any proposed repair must have independent identity
evidence, an exact selection, a rollback plan and approval before writes.

## Re-run

Use the selected production database's public connection URL in an isolated
shell. Run the SELECT file in one read-only transaction:

```sh
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=1000' \
  psql "$DATABASE_PUBLIC_URL" --no-psqlrc --set ON_ERROR_STOP=1 \
  --command 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' \
  --file docs/assessments/2292-survey-response-history.sql \
  --command ROLLBACK
```

Check the database identity and returned access flags before interpreting counts.
Preserve the distinction between the production population and synthetic
controls. This assessment makes no application, schema or stored-data change.
