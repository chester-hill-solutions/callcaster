import { describe, expect, test } from "vitest";

import { patchCampaignQueueBodySchema } from "@/lib/schemas/api/platform-data";

// Roadmap E6.1: each queue action's required fields are enforced by the
// schema, so handlers never guard for them.
describe("patchCampaignQueueBodySchema", () => {
  test("update_status requires a status", () => {
    expect(patchCampaignQueueBodySchema.safeParse({ action: "update_status", ids: [1] }).success).toBe(false);
    expect(patchCampaignQueueBodySchema.safeParse({ action: "update_status", status: "" , ids: [1] }).success).toBe(false);
    const ok = patchCampaignQueueBodySchema.parse({ action: "update_status", status: "queued", all: true, filters: { name: "a" } });
    expect(ok.action).toBe("update_status");
    if (ok.action === "update_status") expect(ok.status).toBe("queued");
  });

  test("add_contact_ids requires a non-empty contact_ids list", () => {
    expect(patchCampaignQueueBodySchema.safeParse({ action: "add_contact_ids" }).success).toBe(false);
    expect(patchCampaignQueueBodySchema.safeParse({ action: "add_contact_ids", contact_ids: [] }).success).toBe(false);
    expect(patchCampaignQueueBodySchema.safeParse({ action: "add_contact_ids", contact_ids: [1, 2] }).success).toBe(true);
  });

  test("add_audience requires an audience_id", () => {
    expect(patchCampaignQueueBodySchema.safeParse({ action: "add_audience" }).success).toBe(false);
    expect(patchCampaignQueueBodySchema.safeParse({ action: "add_audience", audience_id: 7 }).success).toBe(true);
  });

  test("remove requires all: true or a non-empty ids list", () => {
    expect(patchCampaignQueueBodySchema.safeParse({ action: "remove" }).success).toBe(false);
    expect(patchCampaignQueueBodySchema.safeParse({ action: "remove", all: false, ids: [] }).success).toBe(false);
    expect(patchCampaignQueueBodySchema.safeParse({ action: "remove", all: true }).success).toBe(true);
    expect(patchCampaignQueueBodySchema.safeParse({ action: "remove", ids: [3] }).success).toBe(true);
  });

  test("an unknown action is rejected", () => {
    expect(patchCampaignQueueBodySchema.safeParse({ action: "explode" }).success).toBe(false);
  });
});
