import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { CampaignLaunchExtras } from "@/components/campaign/settings/detailed/CampaignLaunchExtras";
import { makePortalConfig } from "../fixtures/workspace-twilio-portal-config";
import type { WorkspaceTwilioSyncSnapshot } from "@/lib/types";

const syncSnapshot: WorkspaceTwilioSyncSnapshot = {
  accountStatus: null, accountFriendlyName: null, phoneNumberCount: 1,
  numberTypes: [], senderTypes: [], recentUsageCount: 0, usageTotalPrice: null,
  lastSyncedAt: null, lastSyncStatus: "never_synced", lastSyncError: null,
};

test("IVR estimates use calls/minute and include worker pacing (#1874)", () => {
  render(<CampaignLaunchExtras
    campaignData={{ id: 9, type: "simple_ivr", status: "running" } as never}
    isBusy={false}
    queueCount={2600}
    phoneNumbers={[]}
    outboundEstimateInputs={{ portalConfig: makePortalConfig(), syncSnapshot }}
  />);
  expect(screen.getByText(/Estimated queue processing rate: 24 calls\/min/)).toBeInTheDocument();
  expect(screen.queryByText(/calls\/sec|CPS|If started now/)).not.toBeInTheDocument();
  expect(screen.getByText(/Remaining queue is estimated to finish around/)).toBeInTheDocument();
});
