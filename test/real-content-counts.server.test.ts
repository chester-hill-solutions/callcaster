import { describe, expect, test, vi } from "vitest";

import { countRealCampaignRows, countRealCampaigns, countRealScripts } from "@/lib/real-content-counts.server";

// #1070: sample content must not count as something the workspace created.
describe("real content counts", () => {
  test("loaded campaign rows exclude samples", () => {
    expect(countRealCampaignRows([{ is_sample: true }, { is_sample: false }, {}])).toBe(2);
    expect(countRealCampaignRows([{ is_sample: true }])).toBe(0);
  });

  test("database counts filter on is_sample = false", async () => {
    const campaignCount = vi.fn(async () => 3);
    const scriptCount = vi.fn(async () => 1);
    const tdb = { campaign: { count: campaignCount }, script: { count: scriptCount } } as never;
    expect(await countRealCampaigns(tdb)).toBe(3);
    expect(await countRealScripts(tdb)).toBe(1);
    expect(campaignCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }));
    expect(scriptCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }));
  });
});
