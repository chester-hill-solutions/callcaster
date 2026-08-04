import { describe, expect, test } from "vitest";

import {
  buildCampaignStatusRail,
  getCampaignPlaceNav,
  resolveCampaignRailPlace,
} from "../app/lib/campaign-status-rail";
import { DEFAULT_WEEKDAY_CALLING_SCHEDULE } from "../app/lib/campaign-setup-steps";
import type { CampaignReadinessIssue } from "../app/lib/campaign-readiness";

const baseCampaign = {
  id: 12,
  type: "live_call" as const,
  caller_id: "+15551234567",
  start_date: "2026-01-01T00:00:00.000Z",
  end_date: "2026-02-01T00:00:00.000Z",
  schedule: DEFAULT_WEEKDAY_CALLING_SCHEDULE,
  status: "draft" as const,
};

describe("app/lib/campaign-status-rail.ts", () => {
  test("resolveCampaignRailPlace maps Setup and Launch as sibling routes", () => {
    const settings = "/workspaces/ws/campaigns/12/settings";
    expect(resolveCampaignRailPlace(settings, "")).toBe("setup");
    expect(resolveCampaignRailPlace(settings, "#campaign-launch")).toBe("setup");
    expect(resolveCampaignRailPlace("/workspaces/ws/campaigns/12/launch")).toBe(
      "launch",
    );
    expect(resolveCampaignRailPlace(`${settings}/`, "#other")).toBe("setup");
  });

  test("resolveCampaignRailPlace maps sibling routes", () => {
    expect(
      resolveCampaignRailPlace("/workspaces/ws/campaigns/12/script/edit"),
    ).toBe("content");
    expect(resolveCampaignRailPlace("/workspaces/ws/campaigns/12/queue")).toBe(
      "queue",
    );
    expect(resolveCampaignRailPlace("/workspaces/ws/campaigns/12/call")).toBe(
      "call",
    );
    expect(resolveCampaignRailPlace("/workspaces/ws/campaigns/12")).toBe(
      "results",
    );
  });

  test("Owner/Admin full rail with ready statuses when no issues", () => {
    const items = buildCampaignStatusRail({
      workspaceId: "ws",
      campaignId: 12,
      campaignData: baseCampaign as any,
      campaignDetails: { script_id: 1 } as any,
      readinessIssues: [],
      hasAccess: true,
      pathname: "/workspaces/ws/campaigns/12/settings",
      hash: "",
    });

    expect(items.map((item) => item.id)).toEqual([
      "setup",
      "content",
      "queue",
      "launch",
      "results",
      "call",
    ]);
    expect(items.find((item) => item.id === "setup")?.isCurrent).toBe(true);
    expect(items.find((item) => item.id === "setup")?.health).toBe("ready");
    expect(items.find((item) => item.id === "launch")?.launchLifecycle).toBe(
      "ready",
    );
    expect(items.find((item) => item.id === "call")?.label).toBe("Call");
  });

  test("Setup/Content/Queue show needs_attention from readiness codes", () => {
    const issues: CampaignReadinessIssue[] = [
      { code: "outbound_number_required", message: "Need a number" },
      { code: "script_required", message: "Need a script" },
      { code: "queue_empty", message: "Add contacts" },
    ];
    const items = buildCampaignStatusRail({
      workspaceId: "ws",
      campaignId: 12,
      campaignData: { ...baseCampaign, caller_id: null } as any,
      readinessIssues: issues,
      hasAccess: true,
      pathname: "/workspaces/ws/campaigns/12/queue",
    });

    expect(items.find((item) => item.id === "setup")?.health).toBe(
      "needs_attention",
    );
    expect(items.find((item) => item.id === "content")?.health).toBe(
      "needs_attention",
    );
    expect(items.find((item) => item.id === "queue")?.health).toBe(
      "needs_attention",
    );
    expect(items.find((item) => item.id === "queue")?.isCurrent).toBe(true);
    expect(items.find((item) => item.id === "results")?.health).toBeUndefined();
  });

  test("Results never needs_attention; idle vs has_results", () => {
    const idle = buildCampaignStatusRail({
      workspaceId: "ws",
      campaignId: 12,
      campaignData: baseCampaign as any,
      readinessIssues: [],
      hasAccess: true,
      pathname: "/workspaces/ws/campaigns/12",
      hasResults: false,
    });
    expect(idle.find((item) => item.id === "results")?.resultsStatus).toBe(
      "idle",
    );

    const withResults = buildCampaignStatusRail({
      workspaceId: "ws",
      campaignId: 12,
      campaignData: { ...baseCampaign, status: "running" } as any,
      readinessIssues: [],
      hasAccess: true,
      pathname: "/workspaces/ws/campaigns/12",
      hasResults: true,
    });
    expect(
      withResults.find((item) => item.id === "results")?.resultsStatus,
    ).toBe("has_results");
  });

  test("Launch lifecycle reflects campaign status", () => {
    const running = buildCampaignStatusRail({
      workspaceId: "ws",
      campaignId: 12,
      campaignData: { ...baseCampaign, status: "running" } as any,
      readinessIssues: [],
      hasAccess: true,
      pathname: "/workspaces/ws/campaigns/12/launch",
    });
    expect(running.find((item) => item.id === "launch")?.isCurrent).toBe(true);
    expect(running.find((item) => item.id === "launch")?.launchLifecycle).toBe(
      "running",
    );
    expect(running.find((item) => item.id === "launch")?.href).toBe(
      "/workspaces/ws/campaigns/12/launch",
    );
  });

  test("Agents see Results + Call only; blocked Call is not navigable", () => {
    const items = buildCampaignStatusRail({
      workspaceId: "ws",
      campaignId: 12,
      campaignData: baseCampaign as any,
      readinessIssues: [],
      hasAccess: false,
      pathname: "/workspaces/ws/campaigns/12",
      joinDisabled: "Outside calling hours",
    });

    expect(items.map((item) => item.id)).toEqual(["results", "call"]);
    const call = items.find((item) => item.id === "call");
    expect(call?.navigable).toBe(false);
    expect(call?.callStatus).toBe("blocked");
    expect(call?.tooltip).toBe("Outside calling hours");
  });

  test("Message campaigns omit Call", () => {
    const items = buildCampaignStatusRail({
      workspaceId: "ws",
      campaignId: 12,
      campaignData: { ...baseCampaign, type: "message" } as any,
      readinessIssues: [],
      hasAccess: true,
      pathname: "/workspaces/ws/campaigns/12/settings",
    });
    expect(items.map((item) => item.id)).not.toContain("call");
  });

  test("getCampaignPlaceNav walks Setup → Content → Queue → Launch → Results", () => {
    expect(getCampaignPlaceNav("ws", 12, "setup")).toEqual({
      back: null,
      next: {
        place: "content",
        label: "Next: Content",
        href: "/workspaces/ws/campaigns/12/script/edit",
      },
    });
    expect(getCampaignPlaceNav("ws", 12, "content").back).toMatchObject({
      place: "setup",
      href: "/workspaces/ws/campaigns/12/settings",
    });
    expect(getCampaignPlaceNav("ws", 12, "queue").next).toMatchObject({
      place: "launch",
      href: "/workspaces/ws/campaigns/12/launch",
    });
    expect(getCampaignPlaceNav("ws", 12, "launch")).toEqual({
      back: {
        place: "queue",
        label: "Back to Queue",
        href: "/workspaces/ws/campaigns/12/queue",
      },
      next: {
        place: "results",
        label: "View Results",
        href: "/workspaces/ws/campaigns/12",
      },
    });
  });
});
