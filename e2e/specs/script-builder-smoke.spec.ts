import { eq } from "drizzle-orm";
import { adminDb } from "@/server/admin-db";
import { script } from "@/db/schema";
import { ownerTest as test, expect } from "../fixtures/test-base";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

/**
 * Drives the script editor in a real browser against a real save.
 *
 * The unit tests cover the state machine and the wire round-trip, but neither
 * exercises the route end to end: loader -> editor -> PATCH /api/scripts ->
 * reload. Page authoring is new (the editor previously had no way to create a
 * page at all), so it needs to be seen working against real persistence.
 */

const WORKSPACE = E2E_WORKSPACES.ready.id;
const LIVE_SCRIPT_ID = 950001;

const pageButtons = /\(start\)|^Page \d+$/;

async function readSteps(): Promise<unknown> {
  const [row] = await adminDb
    .select({ steps: script.steps })
    .from(script)
    .where(eq(script.id, LIVE_SCRIPT_ID));
  return row?.steps ?? null;
}

// This spec saves the seeded script, so restore it rather than letting added
// pages accumulate across runs and skew the next run's counts.
let originalSteps: unknown = null;

test.beforeAll(async () => {
  originalSteps = await readSteps();
});

test.afterAll(async () => {
  await adminDb
    .update(script)
    .set({ steps: originalSteps as never })
    .where(eq(script.id, LIVE_SCRIPT_ID));
});

test("authors a page and persists it across a reload", async ({ page }) => {
  await page.goto(workspacePath(WORKSPACE, `scripts/${LIVE_SCRIPT_ID}`));

  await expect(page.getByRole("button", { name: "Add page" })).toBeVisible();
  const before = await page.getByRole("button", { name: pageButtons }).count();

  await page.getByRole("button", { name: "Add page" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Script saved")).toBeVisible();

  await page.reload();

  await expect(page.getByRole("button", { name: "Add page" })).toBeVisible();
  const after = await page.getByRole("button", { name: pageButtons }).count();
  expect(after).toBe(before + 1);
});

test("marks which page the script starts on", async ({ page }) => {
  // startPageId is now persisted explicitly; it used to be inferred from jsonb
  // key order, i.e. whichever page id happened to sort shortest.
  await page.goto(workspacePath(WORKSPACE, `scripts/${LIVE_SCRIPT_ID}`));

  await expect(page.getByRole("button", { name: /\(start\)/ })).toBeVisible();
});
