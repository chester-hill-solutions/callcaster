# Type-safety strictness

Guards that stop the compiler from being silently defeated. Two shapes: a
**ratcheting count** for escape-hatch casts, and **eslint locks** for suppressions.

## Escape-hatch gate (ratcheting dimension)

`npm run check:type-safety` (in `ci:local`) counts type-escape-hatch constructs
across `app/`, `server/`, `worker/`, `shared/` and compares to a checked-in
baseline (`scripts/type-safety-baseline.json`). **The count may only go down** —
a net-new escape hatch fails CI.

Counted: `as any`, `as unknown as` (not caught by any eslint core rule), `: any`.

- Current baseline: **98** (17 `as any`, 73 `as unknown as`, 8 `: any`).
- After removing existing ones, run `npm run tools:type-safety:baseline` to lower it.
- To add one legitimately (rare — a real driver/SDK boundary), you must lower the
  count elsewhere first; the gate does not accept a net increase.

Prefer, in order: a real type → a `zod` parse at the boundary → a drizzle `sql`
helper for query fragments → (last resort) a documented cast.

## Eslint locks (hard fail)

- `@typescript-eslint/ban-ts-comment`: **`@ts-ignore` fully banned**, `@ts-nocheck`
  banned. `@ts-expect-error` allowed only *with a description* (so a stale
  suppression surfaces as an error when the underlying issue is fixed).
- `import/no-duplicates`: **error** — no two import statements from the same module
  (use inline `import { value, type T }`).

## Next strengthen steps (grounded, not yet done)

- Drive the `as unknown as` count down — the earlier type-safety audit split these
  into legit (drizzle-SQL / JSON-boundary) vs masking-risk; the masking-risk ones
  are already fixed. Categorize the rest and lower the baseline.
- Flip the OFF tsconfig flags one at a time (`exactOptionalPropertyTypes`,
  `noUnusedLocals`/`noUnusedParameters`, `noPropertyAccessFromIndexSignature`) —
  each surfaces a fixable batch.
