# Schema defaults: what the model owes the database

`app/db/schema*.ts` is hand-synced from the migration lineage. Two guards keep
it honest, and they compare different things because a model can be wrong in two
independent ways.

| Guard | Compares | Baseline |
|---|---|---|
| `test/integration-db/schema-type-drift.test.ts` (#2213) | `format_type` — is the column the right *type*? | `scripts/baselines/schema-type-drift.txt` |
| `test/integration-db/schema-default-drift.test.ts` (#2243) | `column_default` — does the model declare the *default*? | `scripts/baselines/schema-default-drift.txt` |

A column can be the right type and still disagree about its default, which is why
one guard could not replace the other. Neither is redundant.

## Why an undeclared default is a defect, not a cosmetic gap

A column that is `NOT NULL DEFAULT now()` in the database but declared
`text().notNull()` in the model has no `.default()`, so Drizzle's
`InferInsertModel` marks it **required**. Every caller must supply a value the
database was always going to supply, and the honest-looking fix at a call site
is to write it by hand:

```ts
created_at: new Date().toISOString()   // a client clock, on a text column
```

That is a wrong value that type-checks. `tsc` cannot see the disagreement,
because "required versus optional" is not a type error.

## Why not every default is modelled

Some defaults exist only so a NOT NULL column can be inserted without a value.
They are **migration scaffolding**, not schema semantics. Inheriting one turns a
forgotten field into a silently wrong row:

| Column | Default | What inheriting it would allow |
|---|---|---|
| `transaction_history.amount` | `0` | a ledger row worth nothing |
| `campaign_queue.attempts` | `0` | retries that never happen |
| `campaign_queue.attempt_count` | `0` | an attempt count that starts wrong |
| `workspace.credits` | `0` | a balance that starts wrong and looks settled |
| `rate_limit_bucket.count` | `1` | a rate limit of one request |
| `user.username` | `''` | an empty username |
| `campaign.caller_id` | `''` | an empty caller id |
| `outreach_attempt.workspace` | `gen_random_uuid()` | a row in no workspace |
| `workspace_invite.workspace` | `gen_random_uuid()` | an invite for no workspace |

Those stay **required** in the model, where the compiler enforces what the
application means, and are baselined with a reason.

One exemption is a different kind of problem: `workspace.name` defaults to
`'Test Workspace'` — a seeded row's name, not a rule. Modelling it faithfully
would enshrine a data value as schema semantics. It needs a migration to drop the
default.

## The scaffolding test is mechanical, on purpose

`isScaffolding()` recognises three shapes, and the reasoning is short enough that
a reviewer can check it against the baseline by eye:

- `""` — an empty string on a NOT NULL column
- `0` — a counter or balance that should start *unset*
- `gen_random_uuid()` — safe on a column named `id`, a silent orphan anywhere else

**Zero only.** A nonzero number is a real default, not a placeholder:
`workspace_number.inbound_ring_count` defaults to `4`, and that is a product
decision the model should carry. The same goes for booleans — `false` on
`workspace.disabled` means "off unless set", which is real semantics.

Anything not matching those shapes must be modelled. `now()`, a generated key, a
config blob and an initial status are all defaults an application genuinely
should inherit.

## Two columns the model covers without a `.default()`

`serial()` and `bigserial()` **are** a sequence default: they make Postgres create
`<table>_<column>_seq` and attach `nextval(...)`. The guard renders them as
declaring a default for that reason. Writing
`.default(sql\`nextval('job_id_seq'::regclass)\`)` on top would be redundant and
would hardcode a sequence name Postgres derives itself, so a renamed table would
diverge silently.

## One column belongs to the *other* guard

`workspace.twilio_data` is `text()` in the model and `jsonb` in the database.
Its `'{}'::jsonb` default cannot be modelled without also fixing its type:
`.default("{}")` would store the two-character string `{}` on a text column —
correct by accident, and it would hide the type drift. It is baselined with a
pointer to #2213.

## The compile-time half

The drift guard needs a live database. `app/db/schema-defaults.contract.ts` guards
the *consequence* with no database at all: a column whose default the database
supplies must be **optional** in `InferInsertModel`.

`npm run typecheck` is the assertion. It lives under `app/` because tsconfig
excludes test files by glob — the same reason `writeBoundaryContract` sits in
`app/server/tenant-db.ts`. A guard no command runs is a comment.

It is written with `@ts-expect-error`-free assertions on purpose: each
`IsOptional<T, K>` resolves to `true` or `never`, and `never` fails the
constraint. The object literals are the counterweight — they supply only the
genuinely required properties, so a guard that made everything optional would
fail them.

## Regenerating a baseline

Deliberately, after changing the exemptions:

```bash
SCHEMA_DEFAULT_DRIFT_UPDATE=1 npm run test:integration-db   # defaults (#2243)
SCHEMA_DRIFT_UPDATE=1       npm run test:integration-db    # types (#2213)
```

`SCHEMA_DEFAULT_DRIFT_UPDATE` writes **only the exemptions**, so one update cannot
bless every new drift in the model.

Both baselines are two-way ratchets. A new drift fails, and a baselined line that
is no longer needed fails too — a stale entry would let the next regression on
that column match it and pass.

## Independent database CI

The [independent workflow](../.github/workflows/schema-default-drift.yml) runs
the full `test:integration-db` tier, including these two guards, on every pull
request and every push to `dev`. It has no file-path filters. A server-only,
route-only or integration-test-only change gets the same database result.
The existing check name remains `guards`.

The job starts an isolated `postgres:18-alpine` database, applies the compose
bootstrap, then runs `npm run test:integration-db`. A bootstrap or test failure
fails this job. There is no `continue-on-error` or conditional step that hides
the failure. E2E still runs the tier separately and prints
`[e2e-compose] running integration-db suites…` before test output.

GitHub keeps a required check pending when its workflow is filtered out. The
unfiltered events avoid that gap ([GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore)).
Running a check does not set repository protection rules. On 2026-10-06 UTC,
the `dev` rules endpoint returned no active rules, and its protection endpoint
returned `Branch not protected`. No settings were changed. The release work
still requires successful checks at the exact PR commit before merge.

### E2E reliability snapshot

On 2026-10-06 UTC, the 40 latest pull-request runs of the
[E2E workflow](https://github.com/chester-hill-solutions/callcaster/actions/workflows/e2e.yml)
contained 25 successful, one failed, seven cancelled and seven skipped `e2e`
jobs. The runs were created from 2026-10-05 11:53:51 UTC through
2026-10-06 02:56:12 UTC. One of 26 completed, executed jobs failed: **3.8%**.
Cancelled and skipped jobs are excluded from that denominator. This sample
uses the latest attempt; it does not measure first-attempt flakiness or identify
the failure's cause. The earlier 32-success/7-failure/1-cancelled snapshot is
retained in [#2211](https://github.com/chester-hill-solutions/callcaster/issues/2211).
Database failures have their own check so an E2E failure does not hide their
result.

## Running the full database tier locally

Both suites need a database and **skip loudly without one**, writing a banner to
stderr rather than passing quietly. `test:integration-db` is not in `ci:local`;
run it separately. Use a disposable database: the fixtures create and remove
rows. Use Node 22 and Postgres 18 to match CI. Apply the same bootstrap first,
then point all supported database URL inputs at that fixture:

```bash
callcaster_integration_db_url='postgres://…'
DATABASE_URL="$callcaster_integration_db_url" node scripts/e2e/bootstrap-compose-db.mjs
DATABASE_URL="$callcaster_integration_db_url" DATABASE_DIRECT_URL="$callcaster_integration_db_url" INTEGRATION_DB_URL="$callcaster_integration_db_url" npm run test:integration-db
```
