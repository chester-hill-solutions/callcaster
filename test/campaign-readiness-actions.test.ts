import { describe, expect, test } from "vitest";

import type { CampaignReadinessCode } from "../app/lib/campaign-readiness";
import {
  CAMPAIGN_READINESS_ACTIONS,
  getCampaignReadinessAction,
  resolveCampaignReadinessRoute,
} from "../app/lib/campaign-readiness-actions";

const CURRENT_READINESS_CODES = [
  "campaign_not_loaded",
  "campaign_type_required",
  "outbound_number_required",
  "outbound_number_unavailable",
  "outbound_number_incapable",
  "messaging_sid_required",
  "messaging_senders_unavailable",
  "dates_required",
  "dates_invalid",
  "start_after_end",
  "calling_hours_required",
  "invalid_intervals",
  "queue_empty",
  "bulk_sender_misaligned",
  "script_required",
  "script_unavailable",
  "audio_unavailable",
  "message_content_required",
] as const satisfies readonly CampaignReadinessCode[];

describe("app/lib/campaign-readiness-actions.ts", () => {
  test("maps every current readiness code to exactly one corrective action", () => {
    expect(Object.keys(CAMPAIGN_READINESS_ACTIONS).sort()).toEqual(
      [...CURRENT_READINESS_CODES].sort(),
    );

    for (const code of CURRENT_READINESS_CODES) {
      expect(getCampaignReadinessAction(code)).toBe(
        CAMPAIGN_READINESS_ACTIONS[code],
      );
    }
  });

  test("uses existing campaign settings scroll targets", () => {
    expect(getCampaignReadinessAction("campaign_type_required")).toMatchObject({
      type: "scroll",
      targetId: "type",
    });
    expect(getCampaignReadinessAction("outbound_number_unavailable")).toMatchObject({
      type: "scroll",
      targetId: "campaign-setup-number",
    });
    expect(getCampaignReadinessAction("dates_invalid")).toMatchObject({
      type: "scroll",
      targetId: "campaign-setup-schedule",
    });
    expect(getCampaignReadinessAction("script_unavailable")).toMatchObject({
      type: "scroll",
      targetId: "campaign-setup-content",
    });
  });

  test("routes queue and sender corrections to registered product routes", () => {
    expect(
      resolveCampaignReadinessRoute(
        getCampaignReadinessAction("queue_empty"),
        { workspaceId: "workspace one", campaignId: 42 },
      ),
    ).toBe("/workspaces/workspace%20one/campaigns/42/queue");

    expect(
      resolveCampaignReadinessRoute(
        getCampaignReadinessAction("messaging_senders_unavailable"),
        { workspaceId: "workspace one", campaignId: 42 },
      ),
    ).toBe("/workspaces/workspace%20one/onboarding");
  });

  test("returns null when resolving a scroll action as a route", () => {
    expect(
      resolveCampaignReadinessRoute(
        getCampaignReadinessAction("message_content_required"),
        { workspaceId: "ws-1", campaignId: 42 },
      ),
    ).toBeNull();
  });
});
