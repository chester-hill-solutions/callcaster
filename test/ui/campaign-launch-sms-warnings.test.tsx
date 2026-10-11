import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { CampaignLaunchExtras } from "@/components/campaign/settings/detailed/CampaignLaunchExtras";
import type { WorkspaceTwilioSyncSnapshot } from "@/lib/types";
import { makePortalConfig } from "../fixtures/workspace-twilio-portal-config";

vi.mock("@/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign", () => ({
  SplitCampaignPrompt: () => (
    <div data-testid="split-campaign-prompt">Large bulk send on a local number</div>
  ),
}));

const syncSnapshot: WorkspaceTwilioSyncSnapshot = {
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

const portalConfig = makePortalConfig({ smsSenderClass: "ca_local" });

function renderExtras() {
  return render(
    <CampaignLaunchExtras
      campaignData={{
        id: 9,
        type: "message",
        title: "Summer outreach",
        caller_id: "+15555550100",
      } as never}
      isBusy={false}
      queueCount={900}
      phoneNumbers={[]}
      outboundEstimateInputs={{ portalConfig, syncSnapshot }}
    />,
  );
}

describe("CampaignLaunchExtras SMS warnings (#2509)", () => {
  test("keeps the bulk-send action and removes the duplicate pacing warning", () => {
    renderExtras();

    expect(screen.getByTestId("split-campaign-prompt")).toBeInTheDocument();
    expect(screen.queryByText("Outbound SMS pacing estimate")).not.toBeInTheDocument();
    expect(screen.queryByText(/Estimated effective send rate/)).not.toBeInTheDocument();
    expect(screen.queryByText(/queue completion is estimated around/)).not.toBeInTheDocument();
  });
});
