# Postgres error-code strictness

**Gate:** `npm run check:pg-errors` (`scripts/check-pg-error-codes.mjs`) — runs in CI and `ci:local`. Zero tolerance, no baseline.

## The rule

All branching on Postgres/PostgREST error codes goes through the helpers in
`app/lib/parse-utils.server.ts`:

- `isUniqueViolation(error)` — 23505
- `isForeignKeyViolation(error)` — 23503
- `isInvalidTextRepresentation(error)` — 22P02
- `isNotFoundError(error)` — PGRST116 (our internal not-found sentinel)
- `getPostgresErrorCode(error)` + `PG_ERROR_CODES` for anything else — add new
  codes to the constant map, never a literal at the call site.

The gate fails on any quote-delimited SQLSTATE literal (classes 22/23) or
`PGRST*` code, and on any `"duplicate key"` message sniff, outside
`app/lib/parse-utils.server.ts` (and the `toUserMessage` deny-list in
`app/lib/user-message.ts`, which matches the phrase in order to redact it).

## Why

Drizzle wraps driver errors in `DrizzleQueryError`; the SQLSTATE lives on
`error.cause`, not `error.code`. Every inline `error.code === "23505"` check
therefore silently missed ORM-wrapped errors. Concretely: creating a campaign
with a duplicate name fell past the intended "name already taken" branch,
returned the raw `DrizzleQueryError` in action data, and surfaced as React
Router's generic **"Unexpected Server Error"** — while tests stayed green,
because the mocks threw errors with `code` set directly on them (the shape the
real stack never produces).

`getPostgresErrorCode` walks the `cause` chain (cycle-safe), so the helpers
match both the direct driver shape and any wrapper.

## Companion conventions

- Never return a raw caught error object in action/loader data — serialize a
  `{ message }` built with `toUserMessage(error, fallback)`
  (`app/lib/user-message.ts`) and log the original server-side.
- Test doubles that simulate DB failures should throw the wrapped shape
  (`Error` with the coded error on `cause`), not a bare `{ code }` — see
  `test/workspace-selected-new-utils.test.ts` and `test/pg-error-codes.test.ts`.
