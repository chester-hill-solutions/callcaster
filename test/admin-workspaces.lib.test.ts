import { describe, expect, test } from "vitest";

import {
  deriveWorkspaceAdminRows,
  filterWorkspaceAdminRows,
  sortWorkspaceAdminRows,
} from "../app/lib/admin-workspaces";

describe("admin workspace helpers", () => {
  const rows = deriveWorkspaceAdminRows({
    workspaces: [
      {
        id: "w1",
        name: "Alpha",
        created_at: "2024-01-01T00:00:00.000Z",
        credits: 100,
        disabled: false,
        cutoff_time: "",
        feature_flags: {},
        key: null,
        owner: null,
        stripe_id: null,
        token: null,
        users: null,
        twilio_data: {
          sid: "AC1",
          authToken: "auth",
          portalConfig: {
            trafficClass: "unknown",
            throughputProduct: "none",
            multiTenancyMode: "none",
            trafficShapingEnabled: false,
            defaultMessageIntent: null,
            sendMode: "messaging_service",
            messagingServiceSid: null,
            onboardingStatus: "not_started",
            supportNotes: "",
            updatedAt: null,
            updatedBy: null,
            auditTrail: [],
          },
          portalSync: {
            accountStatus: "active",
            accountFriendlyName: "Alpha",
            phoneNumberCount: 2,
            numberTypes: ["sms"],
            recentUsageCount: 3,
            usageTotalPrice: 12,
            lastSyncedAt: "2024-02-01T00:00:00.000Z",
            lastSyncStatus: "healthy",
            lastSyncError: null,
          },
        },
        campaign: [{ id: 1 }, { id: 2 }] as any,
      },
      {
        id: "w2",
        name: "Beta",
        created_at: "2024-03-01T00:00:00.000Z",
        credits: 5,
        disabled: true,
        cutoff_time: "",
        feature_flags: {},
        key: null,
        owner: null,
        stripe_id: null,
        token: null,
        users: null,
        twilio_data: {
          sid: "AC2",
          authToken: "auth",
          portalConfig: {
            trafficClass: "unknown",
            throughputProduct: "none",
            multiTenancyMode: "none",
            trafficShapingEnabled: false,
            defaultMessageIntent: null,
            sendMode: "from_number",
            messagingServiceSid: null,
            onboardingStatus: "not_started",
            supportNotes: "",
            updatedAt: null,
            updatedBy: null,
            auditTrail: [],
          },
          portalSync: {
            accountStatus: null,
            accountFriendlyName: null,
            phoneNumberCount: 0,
            numberTypes: [],
            recentUsageCount: 0,
            usageTotalPrice: null,
            lastSyncedAt: null,
            lastSyncStatus: "error",
            lastSyncError: "twilio down",
          },
        },
        campaign: [] as any,
      },
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
        workspace_id: "w1",
        user_id: "u1",
        role: "owner",
        created_at: "2024-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        workspace_id: "w2",
        user_id: "u1",
        role: "owner",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ] as any,
    workspaceNumbers: [
      { id: 1, workspace: "w1", type: "local", created_at: "", capabilities: null, friendly_name: null, inbound_action: null, inbound_audio: null, phone_number: null },
      { id: 2, workspace: "w1", type: "toll-free", created_at: "", capabilities: null, friendly_name: null, inbound_action: null, inbound_audio: null, phone_number: null },
    ] as any,
  });

  test("derives counts and ops state", () => {
    expect(rows[0]).toMatchObject({
      id: "w1",
      ownerUsername: "owner@example.com",
      campaignCount: 2,
      memberCount: 1,
      phoneNumberCount: 2,
      opsState: "attention",
    });
    expect(rows[1]).toMatchObject({
      id: "w2",
      disabled: true,
      opsState: "attention",
    });
  });

  test("filters by search/status/ops state", () => {
    const filtered = filterWorkspaceAdminRows(rows, {
      search: "alpha",
      status: "active",
      owner: "all",
      opsState: "attention",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("w1");
  });

  test("sorts by credits descending", () => {
    const sorted = sortWorkspaceAdminRows(rows, "credits", "desc");
    expect(sorted.map((row) => row.id)).toEqual(["w1", "w2"]);
  });
});
