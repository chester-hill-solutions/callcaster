import { describe, expect, test } from "vitest";
import { predictiveCustomerRecoverySchema, voiceAudioCurrentSnapshotSchema } from "@/lib/schemas/api/voice-audio";
import { recoveredCustomer, recovery } from "./helpers/predictive-recovery-fixture";
import { current } from "./helpers/voice-audio-current-fixture";

describe("predictive recovery wire ownership", () => {
  test.each(["id", "workspace", "user_id", "campaign_id", "contact_id"])("the saved attempt must match %s", field => {
    expect(predictiveCustomerRecoverySchema.safeParse(recovery("10", { ...recoveredCustomer,
      attempt: { ...recoveredCustomer.attempt, [field]: ["id", "campaign_id", "contact_id"].includes(field) ? 99 : "foreign" } })).success).toBe(false);
  });
  test.each(["workspace_id", "user_id", "customer_pending"])("the current actor envelope must match %s", field => {
    const snapshot = { ...current(), customer_pending: true, predictive: recovery(),
      [field]: field === "customer_pending" ? false : "foreign" };
    expect(voiceAudioCurrentSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
  test("joined recovery needs a conference SID; pending recovery does not", () => {
    expect(predictiveCustomerRecoverySchema.safeParse(recovery("10", { ...recoveredCustomer, conference_sid: null })).success).toBe(false);
    expect(predictiveCustomerRecoverySchema.safeParse(recovery("10", { ...recoveredCustomer, human_state: "pending", conference_sid: null })).success).toBe(true);
  });
  test.each(["0", "-1", "01", "1.5", "x"])("active recovery refuses invalid revision %s", revision => {
    expect(predictiveCustomerRecoverySchema.safeParse(recovery(revision)).success).toBe(false);
  });
});
