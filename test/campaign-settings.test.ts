import { describe, expect, test } from "vitest";

import {
  buildCampaignDetailsForType,
  DETAIL_FIELDS,
  normalizeCampaignData,
} from "../app/lib/campaign-settings";

describe("campaign-settings", () => {
  test("DETAIL_FIELDS includes expected keys", () => {
    expect(DETAIL_FIELDS.has("script_id")).toBe(true);
    expect(DETAIL_FIELDS.has("body_text")).toBe(true);
  });

  test("normalizeCampaignData parses string schedule", () => {
    const normalized = normalizeCampaignData({
      id: 1,
      type: "live",
      schedule: '{"days":["mon"]}',
    } as never);

    expect(normalized.schedule).toEqual({ days: ["mon"] });
  });

  test("buildCampaignDetailsForType builds message campaign details", () => {
    expect(
      buildCampaignDetailsForType("message", { body_text: "hi" } as never, 9, "ws-1"),
    ).toEqual({
      campaign_id: 9,
      workspace: "ws-1",
      body_text: "hi",
      message_media: [],
    });
  });

  test("buildCampaignDetailsForType builds ivr campaign details", () => {
    expect(
      buildCampaignDetailsForType(
        "simple_ivr",
        { script_id: 3 } as never,
        2,
        "ws-2",
      ),
    ).toEqual({
      campaign_id: 2,
      workspace: "ws-2",
      script_id: 3,
    });
  });

  test("buildCampaignDetailsForType builds live campaign details", () => {
    expect(
      buildCampaignDetailsForType(
        "live",
        {
          disposition_options: ["a"],
          questions: ["q"],
          script_id: 1,
          voicedrop_audio: "audio",
        } as never,
        4,
        "ws-3",
      ),
    ).toEqual({
      campaign_id: 4,
      workspace: "ws-3",
      disposition_options: ["a"],
      questions: ["q"],
      script_id: 1,
      voicedrop_audio: "audio",
    });
  });
});
