import { describe, expect, test } from "vitest";

import {
  estimateCampaignCredits,
} from "../shared/campaign-billing";

describe("campaign-billing", () => {
  test("estimates SMS campaigns at 1 credit per contact", () => {
    const estimate = estimateCampaignCredits("message", 100);
    expect(estimate.totalCredits).toBe(100);
    expect(estimate.perContactCredits).toBe(1);
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
