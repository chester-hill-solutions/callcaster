import { defineConfig, mergeConfig } from "vitest/config";
import shared from "./vitest.shared.config";

/**
 * Real-Postgres test tier.
 *
 * Everything else in `test/` runs against a mocked db client, which is how a
 * fully green suite once coexisted with a completely broken ledger: the only
 * "tests" for `apply_ledger_entry_and_sync_credits` re-implemented the plpgsql
 * in JS, so reordering the SQL arguments kept them passing. This project runs
 * the real function against a real database instead.
 *
 * Deliberately no `setupFiles`: `test/setup.node.ts` defaults `DATABASE_URL` to
 * a fake localhost URL, which would defeat the env gate these suites use to
 * decide whether a database is actually available.
 *
 * Run with:
 *   docker compose -f docker-compose.dev.yml up -d postgres
 *   DATABASE_URL=... node scripts/e2e/bootstrap-compose-db.mjs
 *   DATABASE_URL=... npm run test:integration-db
 */
export default mergeConfig(
  shared,
  defineConfig({
    test: {
      name: "integration-db",
      environment: "node",
      testTimeout: 60_000,
      hookTimeout: 60_000,
      include: ["test/integration-db/**/*.test.ts"],
      // Suites here create and drop real rows; running files against one
      // database in parallel invites cross-file interference for no gain.
      fileParallelism: false,
    },
  }),
);
