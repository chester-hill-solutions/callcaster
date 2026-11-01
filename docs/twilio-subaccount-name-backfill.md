# Backfill legacy Twilio subaccount names

This is child #3102, the name-backfill part of #2168. The existing cull reports remain
read-only. This command does not release numbers, delete workspaces, change
account status, rotate credentials or schedule recurring cleanup.

Use Bun, or the project's Node 22 runtime. The command reads the parent Twilio
account and the workspace ownership records. It prints a JSON plan by default.
It sends no provider writes until an operator supplies a reviewed plan with
`--apply`.

## Prepare the ownership sources

Use the correct public database URL for each deployed environment. Obtain the
existing values in a trusted shell or secret manager; do not put credentials in
arguments, plans, issues or commits. The command does not read or modify `.env`.

The current durable environments are dev, QA and production. All three are
required ownership sources because they share a Twilio account. Include any
additional database that can reference that account with another `--database`
argument. Confirm each environment-to-database binding before generating a plan.
The command checks actual database identities so two URL aliases cannot count
as separate sources. The identity hashes bind the reviewed plan to those
sources; a label alone does not prove which deployment a URL belongs to.

Supply these environment variables:

- `CC_DEV_DATABASE_URL`, `CC_QA_DATABASE_URL`, `CC_PRODUCTION_DATABASE_URL`.
- `TWILIO_SID` for the parent account.
- `TWILIO_AUTH_TOKEN`, or a Main API key and secret in `TWILIO_API_KEY` and
  `TWILIO_API_SECRET`. Standard API keys cannot manage subaccounts. See
  [Twilio's Account API](https://www.twilio.com/docs/iam/api/account).

Production is an ownership source only. The command accepts dev or QA as the
target. Each database query runs in a read-only transaction and returns only
workspace ID, name, archived state and account SID. Stored credentials never
leave that query.

## Review the dry-run

```sh
bun scripts/backfill-twilio-subaccount-names.mjs --environment dev \
  --database dev=CC_DEV_DATABASE_URL \
  --database qa=CC_QA_DATABASE_URL \
  --database production=CC_PRODUCTION_DATABASE_URL > reviewed-plan.json
```

Keep the plan private. It contains workspace labels and identifiers, but no
provider credentials or database URLs. Check its target environment, parent
account, database bindings and every proposed `before` and `after` name.

A rename requires all of these conditions:

- The target source exposes archive state; the workspace is not archived and has a usable name.
- All recognized SID fields agree on one account, which belongs to exactly one workspace in the target source.
- No other supplied environment references that SID in any recognized field, including archived or conflicting legacy rows.
- The provider account is active and belongs to the selected parent.
- Its current label is the workspace's full UUID. A custom label is protected.

Older reference databases without archive support still protect every stored
owner. They cannot serve as a rename target until archive state is available.

Already-correct names are unchanged. Missing, ambiguous and conflicting owners
are blocked. Unmapped provider accounts are untouched. A failure to read any
required database or the complete provider inventory stops the command.

The target is `Workspace Name · <first eight UUID characters>`. The formatter
retains the suffix within the Account API's
[64-character limit](https://www.twilio.com/docs/iam/api/account#account-properties).
Long Unicode names retain complete characters.

## Apply the reviewed plan

Use the same source variables and target, with the reviewed file:

```sh
bun scripts/backfill-twilio-subaccount-names.mjs --environment dev \
  --database dev=CC_DEV_DATABASE_URL \
  --database qa=CC_QA_DATABASE_URL \
  --database production=CC_PRODUCTION_DATABASE_URL \
  --apply reviewed-plan.json > apply-result.json 2> apply-progress.jsonl
```

Apply validates the whole approved set before the first write. It reads
ownership and provider state again before each rename. It changes only
`FriendlyName`. A changed owner, name, database or account blocks that write.
New candidates outside the approved plan are not added to the apply run.

Each verified change is written to the progress stream. A failure stops further
writes and includes the changes already verified. Check provider state after a
failed request before continuing. Replaying the same approval skips an account
that already has the approved name. It never resets a custom name.

Keep both receipts, then run the dry-run again. This confirms the completed
names and shows any remaining blocked work. The command cannot make the
retention or repeat-policy decision in #2029. Workspace-row cleanup remains
deferred, and #2168 stays open until its operational and policy acceptance is
complete.
