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
import { eq } from "drizzle-orm";
import { campaign as campaignTable, script as scriptTable } from "@/db/schema";
import type { WorkspaceOnboardingGoal } from "@/lib/types";
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
    is_sample: true,
    type: "script",
    steps: SAMPLE_SCRIPT_STEPS as unknown as Json,
    created_by: userId,
  });
  if (!script) {
    throw new Error("Failed to seed sample script: insert returned no row");
  }

  const [campaign] = await tdb.campaign.insert({
    title: "Sample campaign — explore CallCaster",
    is_sample: true,
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

/** Sample text for an SMS-goal workspace; template tags show what the composer can do. */
export const SAMPLE_SMS_BODY =
  "Hi {{firstname}}, this is a sample text from your CallCaster workspace. Reply STOP to opt out.";

export type SampleRetargetResult = { retargeted: boolean; type: string | null };

/**
 * Reshape the seeded sample campaign to match the goal the workspace just
 * chose (#1323): an SMS goal gets a message campaign with sample copy, an
 * automated-menu goal an IVR campaign on the sample script, live calling
 * stays a live-call campaign. Only an untouched draft sample is changed;
 * renting a number leaves it alone. Never throws into onboarding: the goal
 * save is the important write, this is decoration.
 */
export async function retargetSampleCampaignForGoal(args: {
  workspaceId: string;
  goal: WorkspaceOnboardingGoal;
  tdb?: TenantDb;
}): Promise<SampleRetargetResult> {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const sample = await tdb.campaign.findFirst({ where: eq(campaignTable.is_sample, true) });
  if (!sample || sample.status !== "draft") {
    return { retargeted: false, type: null };
  }
  const plan = sampleCampaignPlanForGoal(args.goal);
  if (!plan) {
    return { retargeted: false, type: null };
  }
  await tdb.campaign.update({
    set: { type: plan.type, body_text: plan.body_text, script_id: plan.keepScript ? sample.script_id : null },
    where: eq(campaignTable.id, sample.id),
  });
  if (plan.scriptType) {
    await tdb.script.update({
      set: { type: plan.scriptType },
      where: eq(scriptTable.is_sample, true),
    });
  }
  return { retargeted: true, type: plan.type };
}

function sampleCampaignPlanForGoal(
  goal: WorkspaceOnboardingGoal,
): { type: string; body_text: string | null; keepScript: boolean; scriptType: string | null } | null {
  switch (goal) {
    case "sms_blast":
      return { type: "message", body_text: SAMPLE_SMS_BODY, keepScript: false, scriptType: null };
    case "ivr":
      return { type: "simple_ivr", body_text: null, keepScript: true, scriptType: "ivr" };
    case "live_call":
      return { type: "live_call", body_text: null, keepScript: true, scriptType: "script" };
    case "rent_number":
      return null;
    default: {
      const _exhaustive: never = goal;
      return _exhaustive;
    }
  }
}
