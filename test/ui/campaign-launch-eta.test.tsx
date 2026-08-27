/**
 * Launch-page ETA must project through the campaign's dispatch-time
 * restrictions (#1351): a send window opening later today must push the
 * "queue completion" range past the window boundary, not assume continuous
 * sending from now.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  // The ETA formatter renders in machine-local time — pin it so the window
  // boundary (20:00 UTC → 8:00 PM) is deterministic.
  process.env.TZ = "UTC";
});

import { CampaignLaunchExtras } from "@/components/campaign/settings/detailed/CampaignLaunchExtras";
import type { WorkspaceTwilioSyncSnapshot } from "@/lib/types";
import { makePortalConfig } from "../fixtures/workspace-twilio-portal-config";

vi.mock("@/components/campaign/settings/detailed/AddAudioSheet", () => ({
  AddAudioSheet: () => null,
}));
vi.mock("@/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign", () => ({
  SplitCampaignPrompt: () => null,
}));

const baseSyncSnapshot: WorkspaceTwilioSyncSnapshot = {
  accountStatus: null,
  accountFriendlyName: null,
  phoneNumberCount: 10,
  numberTypes: [],
  senderTypes: [],
  recentUsageCount: 0,
  usageTotalPrice: null,
  lastSyncedAt: null,
  lastSyncStatus: "never_synced",
  lastSyncError: null,
};

const portalConfig = makePortalConfig({
  trafficClass: "short_code",
  throughputProduct: "account_based_throughput",
  sendMode: "messaging_service",
  messagingServiceSid: "MG123",
  onboardingStatus: "enabled",
  smsSenderClass: "ca_short_code",
  smsTargetMps: 100,
});

function renderExtras(smsSendWindow: unknown) {
  return render(
    <CampaignLaunchExtras
      campaignData={
        {
          id: 9,
          type: "message",
          title: "Summer outreach",
          caller_id: "+15555550100",
          sms_send_mode: "messaging_service",
          sms_messaging_service_sid: "MG123",
          sms_send_window: smsSendWindow,
        } as never
      }
      handleInputChange={vi.fn()}
      mediaData={[]}
      details={{} as never}
      isBusy={false}
      queueCount={6}
      phoneNumbers={[]}
      outboundEstimateInputs={{ portalConfig, syncSnapshot: baseSyncSnapshot }}
      workspaceId="ws-1"
    />,
  );
}

// Monday 2026-08-24, 19:00 UTC. The window below opens Monday 20:00 UTC.
const NOW = new Date("2026-08-24T19:00:00.000Z");

describe("CampaignLaunchExtras ETA (#1351)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a send window opening later today pushes the ETA past the boundary", () => {
    renderExtras({
      monday: { active: true, intervals: [{ start: "20:00", end: "21:00" }] },
    });
    const etaLine = screen.getByText(/queue completion is estimated around/).textContent ?? "";
    // 6 contacts at ~100 msg/s finish inside the first ~seconds of the
    // window: both bounds must name the 20:00 hour, not "now" (19:00).
    expect(etaLine).toMatch(/8:00 PM/);
    expect(etaLine).not.toMatch(/7:00 PM/);
  });

  test("an unrestricted window keeps the immediate ETA", () => {
    renderExtras(null);
    const etaLine = screen.getByText(/queue completion is estimated around/).textContent ?? "";
    expect(etaLine).toMatch(/7:00 PM/);
  });
});
