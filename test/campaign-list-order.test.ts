import { describe, expect, test } from "vitest";
import { sortCampaignsForList } from "@/lib/campaign-list-order";

describe("sortCampaignsForList", () => {
  test("groups requested statuses and sorts newest first without mutating input", () => {
    const campaigns = [
      { id: 1, status: "complete", created_at: "2026-09-19T12:00:00Z" },
      { id: 2, status: "running", created_at: "2026-09-19T10:00:00Z" },
      { id: 3, status: "running", created_at: "2026-09-19T11:00:00Z" },
      { id: 4, status: "waiting", created_at: "2026-09-19T09:00:00Z" },
      { id: 5, status: "draft", created_at: "2026-09-19T08:00:00Z" },
      { id: 6, status: "paused", created_at: "2026-09-19T13:00:00Z" },
    ];
    const originalIds = campaigns.map((campaign) => campaign.id);

    const sorted = sortCampaignsForList(campaigns);

    expect(sorted.map((campaign) => campaign.id)).toEqual([3, 2, 4, 5, 1, 6]);
    expect(campaigns.map((campaign) => campaign.id)).toEqual(originalIds);
    expect(sorted).not.toBe(campaigns);
  });
});
