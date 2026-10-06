import { describe, expect, test } from "vitest";

import { estimateCampaignCredits } from "../shared/campaign-billing";

describe("campaign-billing", () => {
  test("estimates a single-segment SMS campaign", () => {
    const estimate = estimateCampaignCredits("message", 100, { body: "Hello", hasMedia: false });
    expect(estimate.totalCredits).toBe(200);
    expect(estimate.perContactCredits).toBe(2);
    expect(estimate.rateDescription).toBe("2 credits per SMS segment (1 segment per message; MMS excluded)");
  });

  test("estimates IVR campaigns at 2 credits per dial", () => {
    const estimate = estimateCampaignCredits("robocall", 50);
    expect(estimate.totalCredits).toBe(100);
    expect(estimate.perContactCredits).toBe(2);
  });

  test("estimates staffed live campaigns at 4 credits per dial", () => {
    const estimate = estimateCampaignCredits("live_call", 25);
    expect(estimate.totalCredits).toBe(100);
    expect(estimate.perContactCredits).toBe(4);
  });
});
