import { describe, expect, test, vi } from "vitest";

vi.mock("../app/lib/messaging-onboarding.server", () => ({
  getWorkspaceMessagingOnboardingFromTwilioData: (twilioData: any) => ({
    status: twilioData?.onboardingStatus ?? "not_started",
  }),
  deriveWorkspaceMessagingReadiness: ({ onboarding }: any) => {
    const status = onboarding?.status;
    return {
      warnings: status === "warn" ? ["warning"] : [],
      shouldRedirectToOnboarding: status === "redirect",
      sendMode: status === "readiness_ms" ? "messaging_service" : "from_number",
      voiceReady: status !== "voice_not_ready",
      legacyMode: status === "legacy",
    };
  },
}));

import { deriveWorkspaceAdminRows } from "../app/lib/admin-workspaces.server";
import {
  filterWorkspaceAdminRows,
  sortWorkspaceAdminRows,
} from "../app/lib/admin-workspaces";

function makeBaseWorkspace(
  id: string,
  name: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name,
    created_at: "2024-01-01T00:00:00.000Z",
    credits: 10,
    disabled: false,
    cutoff_time: "",
    feature_flags: {},
    key: null,
    owner: null,
    stripe_id: null,
    token: null,
    users: null,
    twilio_data: {},
    campaign: [],
    ...overrides,
  };
}

describe("admin workspace helpers", () => {
  test("derives workspace rows across twilio and readiness states", () => {
    const rows = deriveWorkspaceAdminRows({
      workspaces: [
        makeBaseWorkspace("w-ready", "Ready", {
          twilio_data: {
            portalSync: {
              lastSyncStatus: "healthy",
              accountStatus: "active",
              lastSyncedAt: " 2024-02-01T00:00:00.000Z ",
              lastSyncError: "",
              numberTypes: ["sms", 42, "voice"],
            },
            portalConfig: {
              sendMode: "from_number",
            },
            onboardingStatus: "done",
          },
          campaign: [{ id: 1 }, null],
        }),
        makeBaseWorkspace("w-pending-sync", "Pending Sync", {
          twilio_data: {
            portalSync: {
              lastSyncStatus: "syncing",
              numberTypes: [],
            },
          },
        }),
        makeBaseWorkspace("w-pending-never", "Pending Never", {
          twilio_data: {
            portalSync: {
              lastSyncStatus: "mystery",
            },
          },
        }),
        makeBaseWorkspace("w-attention-error", "Attention Error", {
          twilio_data: {
            portalSync: {
              lastSyncStatus: "error",
              lastSyncError: "down",
            },
          },
        }),
        makeBaseWorkspace("w-attention-config", "Attention Config", {
          twilio_data: {
            portalSync: {
              lastSyncStatus: "healthy",
            },
            portalConfig: {
              sendMode: "messaging_service",
              messagingServiceSid: "",
            },
          },
        }),
        makeBaseWorkspace("w-attention-warning", "Attention Warning", {
          twilio_data: {
            portalSync: {
              lastSyncStatus: "healthy",
            },
            onboardingStatus: "warn",
          },
        }),
        makeBaseWorkspace("w-pending-redirect", "Pending Redirect", {
          twilio_data: {
            portalSync: {
              lastSyncStatus: "healthy",
              numberTypes: [],
            },
            onboardingStatus: "redirect",
          },
        }),
        makeBaseWorkspace("w-legacy", "Legacy", {
          twilio_data: {
            portalSync: {
              lastSyncStatus: "healthy",
            },
            onboardingStatus: "legacy",
          },
        }),
        makeBaseWorkspace("w-ms-readiness", "Messaging Service", {
          twilio_data: {
            portalSync: {
              lastSyncStatus: "healthy",
            },
            portalConfig: {
              sendMode: "from_number",
              messagingServiceSid: "  MG123  ",
            },
            onboardingStatus: "readiness_ms",
          },
          campaign: null,
        }),
        makeBaseWorkspace("w-raw-data", "Raw Data", {
          twilio_data: [],
        }),
      ] as any,
      users: [
        {
          id: "u1",
          username: "owner@example.com",
          first_name: null,
          last_name: null,
          organization: null,
          access_level: "sudo",
          activity: {},
          created_at: "2024-01-01T00:00:00.000Z",
          verified_audio_numbers: null,
        },
      ] as any,
      workspaceUsers: [
        {
          id: 1,
          workspace_id: "w-ready",
          user_id: "u1",
          role: "owner",
          created_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: 2,
          workspace_id: "w-raw-data",
          user_id: "missing-user",
          role: "owner",
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ] as any,
      workspaceNumbers: [
        {
          id: 1,
          workspace: "w-pending-sync",
          type: "local",
          created_at: "",
          capabilities: null,
          friendly_name: null,
          inbound_action: null,
          inbound_audio: null,
          phone_number: null,
        },
        {
          id: 2,
          workspace: "w-pending-sync",
          type: "toll-free",
          created_at: "",
          capabilities: null,
          friendly_name: null,
          inbound_action: null,
          inbound_audio: null,
          phone_number: null,
        },
      ] as any,
    });

    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

    expect(byId["w-ready"]).toMatchObject({
      ownerUsername: "owner@example.com",
      ownerUserId: "u1",
      campaignCount: 1,
      memberCount: 1,
      twilioSyncStatus: "healthy",
      twilioAccountStatus: "active",
      twilioLastSyncedAt: "2024-02-01T00:00:00.000Z",
      twilioLastSyncError: null,
      twilioNumberTypes: ["sms", "voice"],
      opsState: "ready",
      sendMode: "from_number",
      onboardingStatus: "done",
      voiceReady: true,
      legacyMode: false,
    });

    expect(byId["w-pending-sync"]?.opsState).toBe("pending");
    expect(byId["w-pending-sync"]?.twilioNumberTypes).toEqual([
      "local",
      "toll-free",
    ]);
    expect(byId["w-pending-never"]?.twilioSyncStatus).toBe("never_synced");
    expect(byId["w-pending-never"]?.opsState).toBe("pending");
    expect(byId["w-attention-error"]?.opsState).toBe("attention");
    expect(byId["w-attention-config"]?.opsState).toBe("attention");
    expect(byId["w-attention-warning"]?.opsState).toBe("attention");
    expect(byId["w-pending-redirect"]?.opsState).toBe("pending");
    expect(byId["w-legacy"]?.opsState).toBe("ready");
    expect(byId["w-ms-readiness"]?.sendMode).toBe("messaging_service");
    expect(byId["w-ms-readiness"]?.campaignCount).toBe(0);
    expect(byId["w-raw-data"]).toMatchObject({
      ownerUsername: "No owner",
      ownerUserId: null,
      twilioSyncStatus: "never_synced",
      opsState: "pending",
    });
  });

  test("filters by search status owner and ops state", () => {
    const rows = [
      {
        id: "a-1",
        name: "Alpha",
        ownerUsername: "Owner",
        ownerUserId: "u1",
        credits: 5,
        disabled: false,
        campaignCount: 1,
        memberCount: 2,
        phoneNumberCount: 3,
        createdAt: "2024-01-01",
        twilioSyncStatus: "healthy",
        twilioAccountStatus: null,
        twilioLastSyncedAt: null,
        twilioLastSyncError: null,
        twilioNumberTypes: [],
        opsState: "ready",
        sendMode: "from_number",
        onboardingStatus: "done",
        voiceReady: true,
        legacyMode: false,
      },
      {
        id: "b-2",
        name: "Beta",
        ownerUsername: "Team",
        ownerUserId: "u2",
        credits: 1,
        disabled: true,
        campaignCount: 0,
        memberCount: 1,
        phoneNumberCount: 0,
        createdAt: "2024-02-01",
        twilioSyncStatus: "error",
        twilioAccountStatus: null,
        twilioLastSyncedAt: null,
        twilioLastSyncError: "err",
        twilioNumberTypes: [],
        opsState: "attention",
        sendMode: "from_number",
        onboardingStatus: "warn",
        voiceReady: false,
        legacyMode: true,
      },
    ] as const;

    expect(
      filterWorkspaceAdminRows(rows as any, {
        search: "  ",
        status: "all",
        owner: "all",
        opsState: "all",
      }).map((row) => row.id),
    ).toEqual(["a-1", "b-2"]);

    expect(
      filterWorkspaceAdminRows(rows as any, {
        search: "owner",
        status: "active",
        owner: "u1",
        opsState: "ready",
      }).map((row) => row.id),
    ).toEqual(["a-1"]);

    expect(
      filterWorkspaceAdminRows(rows as any, {
        search: "b-2",
        status: "disabled",
        owner: "u2",
        opsState: "attention",
      }).map((row) => row.id),
    ).toEqual(["b-2"]);
  });

  test("sorts by every sort key in both directions", () => {
    const rows = [
      {
        id: "z",
        name: "Zulu",
        ownerUsername: "u",
        ownerUserId: "u",
        credits: 1,
        disabled: false,
        campaignCount: 2,
        memberCount: 3,
        phoneNumberCount: 4,
        createdAt: "2024-02-01",
        twilioSyncStatus: "healthy",
        twilioAccountStatus: null,
        twilioLastSyncedAt: null,
        twilioLastSyncError: null,
        twilioNumberTypes: [],
        opsState: "ready",
        sendMode: "from_number",
        onboardingStatus: "done",
        voiceReady: true,
        legacyMode: false,
      },
      {
        id: "a",
        name: "Alpha",
        ownerUsername: "u",
        ownerUserId: "u",
        credits: 10,
        disabled: false,
        campaignCount: 1,
        memberCount: 2,
        phoneNumberCount: 1,
        createdAt: "2024-01-01",
        twilioSyncStatus: "healthy",
        twilioAccountStatus: null,
        twilioLastSyncedAt: null,
        twilioLastSyncError: null,
        twilioNumberTypes: [],
        opsState: "ready",
        sendMode: "from_number",
        onboardingStatus: "done",
        voiceReady: true,
        legacyMode: false,
      },
    ] as any;

    expect(
      sortWorkspaceAdminRows(rows, "name", "asc").map((row) => row.id),
    ).toEqual(["a", "z"]);
    expect(
      sortWorkspaceAdminRows(rows, "name", "desc").map((row) => row.id),
    ).toEqual(["z", "a"]);
    expect(
      sortWorkspaceAdminRows(rows, "created_at", "asc").map((row) => row.id),
    ).toEqual(["a", "z"]);
    expect(
      sortWorkspaceAdminRows(rows, "credits", "asc").map((row) => row.id),
    ).toEqual(["z", "a"]);
    expect(
      sortWorkspaceAdminRows(rows, "campaign_count", "asc").map(
        (row) => row.id,
      ),
    ).toEqual(["a", "z"]);
    expect(
      sortWorkspaceAdminRows(rows, "member_count", "asc").map((row) => row.id),
    ).toEqual(["a", "z"]);
    expect(
      sortWorkspaceAdminRows(rows, "phone_number_count", "asc").map(
        (row) => row.id,
      ),
    ).toEqual(["a", "z"]);
  });
});
