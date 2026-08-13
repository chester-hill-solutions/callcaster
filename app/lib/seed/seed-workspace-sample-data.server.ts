/**
 * "First-value onboarding": seeds a sample script + draft campaign into a
 * newly created workspace so there's something to explore immediately.
 * Called as a best-effort step from `createNewWorkspace`; failures here must
 * never fail workspace creation (see caller's try/catch).
 *
 * Intentionally does NOT seed audiences/contacts — that would require fake
 * phone numbers in a dialer.
 */
import type { Json } from "@/lib/db-types";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { SAMPLE_SCRIPT_STEPS } from "./sample-script.server";

export async function seedWorkspaceSampleData(
  workspaceId: string,
  userId: string,
  tdbIn?: TenantDb,
) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  const [script] = await tdb.script.insert({
    name: "Sample script — customer check-in",
    type: "script",
    steps: SAMPLE_SCRIPT_STEPS as unknown as Json,
    created_by: userId,
  });
  if (!script) {
    throw new Error("Failed to seed sample script: insert returned no row");
  }

  const [campaign] = await tdb.campaign.insert({
    title: "Sample campaign — explore CallCaster",
    status: "draft",
    type: "live_call",
    caller_id: null,
    dial_ratio: 1,
    next_queue_order: 0,
    group_household_queue: false,
    script_id: script.id,
  });
  if (!campaign) {
    throw new Error("Failed to seed sample campaign: insert returned no row");
  }

  return { script, campaign };
}
