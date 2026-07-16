import { afterAll, describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

import { audience as audienceTable } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import {
  createEmptyAudience,
  markAudienceUpdating,
} from "@/lib/audience-upload-db.server";

/**
 * Regression coverage for the P0 audit finding: `audience.status` is backed
 * by the Postgres `audience_status` enum, which only accepts
 * pending | processing | completed | error (drizzle/0000_baseline.sql:86;
 * confirmed live via `select enum_range(null::audience_status)`). The
 * Drizzle column is typed as plain `text()` (app/db/schema.ts), so TypeScript
 * cannot catch an invalid literal — only Postgres does, at insert/update
 * time. `createEmptyAudience` used to write "empty" (100% throw) and the
 * upload finalize step used to write "active" (throw *after* contacts were
 * already imported, stranding the audience upload as "error"). These tests
 * run the real functions against the local Postgres instance so an invalid
 * literal fails loudly instead of being silently accepted by a mock.
 */

const ALLOWED_AUDIENCE_STATUSES = ["pending", "processing", "completed", "error"];

// "E2E Ready Workspace" — pre-existing fixture row (see e2e/fixtures/seed.ts)
// used only to satisfy the audience.workspace FK. We do not touch its data.
const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";

// NOTE: the audit brief asked to seed at audience id 920001, but that id is
// permanently reserved by e2e/fixtures/seed.ts's E2E_AUDIENCE fixture (used by
// Playwright specs) and already exists in this DB. Reusing it would either
// collide on the primary key or corrupt a shared fixture, so these rows are
// allowed to take their normal auto-incremented ids instead and are deleted
// in afterAll. All row names are prefixed "AuditFix" per instructions.
const createdAudienceIds: number[] = [];

afterAll(async () => {
  for (const id of createdAudienceIds) {
    await db.delete(audienceTable).where(eq(audienceTable.id, id));
  }
});

describe("audience_status enum drift (audit fix, AUDIENCES)", () => {
  test("createEmptyAudience writes a valid audience_status against real Postgres", async () => {
    const row = await createEmptyAudience(WORKSPACE_ID, "AuditFix Empty Audience");

    expect(row).not.toBeNull();
    createdAudienceIds.push(row!.id);

    expect(ALLOWED_AUDIENCE_STATUSES).toContain(row!.status);
    expect(row!.status).toBe("completed");
  });

  test("markAudienceUpdating writes a valid audience_status against real Postgres", async () => {
    const row = await createEmptyAudience(WORKSPACE_ID, "AuditFix Updating Audience");
    expect(row).not.toBeNull();
    createdAudienceIds.push(row!.id);

    // Previously wrote status: "updating", which is not a member of the
    // audience_status enum and throws on update.
    await markAudienceUpdating(WORKSPACE_ID, row!.id);

    const tdb = createTenantDb(WORKSPACE_ID);
    const updated = await tdb.audience.findFirst({
      where: eq(audienceTable.id, row!.id),
    });

    expect(updated).toBeTruthy();
    expect(ALLOWED_AUDIENCE_STATUSES).toContain(updated!.status);
    expect(updated!.status).toBe("processing");
  });

  test("upload finalize literal in audience-upload-process.server.ts is a valid enum value accepted by real Postgres", async () => {
    const source = await readFile(
      resolve(process.cwd(), "app/lib/audience-upload-process.server.ts"),
      "utf8",
    );

    // Isolate the success-path "Update audience status" finalize block so we
    // read the literal actually shipped in source (not the catch-block
    // "error" literal a few lines below it). This makes the test fail the
    // instant someone reverts the finalize status back to "active".
    const finalizeBlockMatch = source.match(
      /\/\/ Update audience status[\s\S]{0,400}?status:\s*"([a-zA-Z]+)"/,
    );
    expect(finalizeBlockMatch).not.toBeNull();
    const finalizeStatus = finalizeBlockMatch![1];

    expect(ALLOWED_AUDIENCE_STATUSES).toContain(finalizeStatus);
    expect(finalizeStatus).toBe("completed");

    // Prove Postgres actually accepts this literal for the audience_status
    // column — this is exactly what throws for invalid literals like the old
    // "active"/"empty"/"updating".
    const row = await createEmptyAudience(WORKSPACE_ID, "AuditFix Finalize Audience");
    expect(row).not.toBeNull();
    createdAudienceIds.push(row!.id);

    const tdb = createTenantDb(WORKSPACE_ID);
    await tdb.audience.update({
      set: { status: finalizeStatus, total_contacts: 3 },
      where: eq(audienceTable.id, row!.id),
    });

    const finalized = await tdb.audience.findFirst({
      where: eq(audienceTable.id, row!.id),
    });
    expect(finalized!.status).toBe("completed");
    expect(finalized!.total_contacts).toBe(3);
  });
});
