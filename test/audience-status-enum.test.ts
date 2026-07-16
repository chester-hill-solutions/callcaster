import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Regression coverage for the P0 audit finding: `audience.status` is backed by
 * the Postgres `audience_status` enum, which only accepts
 * pending | processing | completed | error (drizzle/0000_baseline.sql:86). The
 * Drizzle column is typed as plain `text()` (app/db/schema.ts), so TypeScript
 * cannot catch an invalid literal. `createEmptyAudience` used to write "empty"
 * (100% throw); the CSV finalize step wrote "active" (throw after import); and
 * `markAudienceUpdating` wrote "updating" — none are enum members.
 *
 * This captures the exact `status` each function writes and asserts it is a
 * valid enum member. It mocks the tenant DB rather than hitting real Postgres:
 * CI's `test:node` job has no live database, so a real-Postgres test fails there
 * even though it passes locally (that is what this file previously did wrong).
 */

const ALLOWED_AUDIENCE_STATUSES = ["pending", "processing", "completed", "error"];

const captured = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ set?: Record<string, unknown> }>,
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    audience: {
      insert: async (payload: Record<string, unknown>) => {
        captured.inserts.push(payload);
        return [{ id: 1, ...payload }];
      },
      update: async (payload: { set?: Record<string, unknown> }) => {
        captured.updates.push(payload);
        return [{ id: 1 }];
      },
      findFirst: async () => ({ id: 1 }),
    },
  }),
}));
vi.mock("@/server/db", () => ({ db: {} }));

import {
  createEmptyAudience,
  markAudienceUpdating,
} from "@/lib/audience-upload-db.server";

describe("audience_status enum drift (audit fix, AUDIENCES)", () => {
  beforeEach(() => {
    captured.inserts.length = 0;
    captured.updates.length = 0;
  });

  test("createEmptyAudience writes a valid audience_status enum value", async () => {
    await createEmptyAudience("ws-1", "AuditFix Empty Audience");
    const written = captured.inserts.at(-1)?.status;
    expect(ALLOWED_AUDIENCE_STATUSES, `wrote status="${String(written)}"`).toContain(
      written,
    );
    expect(written).toBe("completed");
  });

  test("markAudienceUpdating writes a valid audience_status enum value", async () => {
    await markAudienceUpdating("ws-1", 1);
    const written = captured.updates.at(-1)?.set?.status;
    expect(ALLOWED_AUDIENCE_STATUSES, `wrote status="${String(written)}"`).toContain(
      written,
    );
    expect(written).toBe("processing");
  });

  test("CSV finalize writes a valid audience_status enum literal in source", async () => {
    const source = await readFile(
      resolve(process.cwd(), "app/lib/audience-upload-process.server.ts"),
      "utf8",
    );
    // The success-path "Update audience status" finalize block — not the
    // catch-block "error" literal a few lines below. Fails the instant someone
    // reverts the finalize status back to "active".
    const m = source.match(
      /\/\/ Update audience status[\s\S]{0,400}?status:\s*"([a-zA-Z]+)"/,
    );
    expect(m).not.toBeNull();
    expect(ALLOWED_AUDIENCE_STATUSES, `finalize wrote "${m?.[1]}"`).toContain(m![1]);
    expect(m![1]).toBe("completed");
  });
});
