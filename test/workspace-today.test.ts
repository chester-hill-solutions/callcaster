import { describe, expect, test } from "vitest";
import {
  selectWorkspaceToday,
  type SelectWorkspaceTodayInput,
} from "@/lib/workspace-today.server";

const baseInput: SelectWorkspaceTodayInput = {
  workspaceId: "workspace one",
  userRole: "admin",
  credits: 100,
  intakeIncomplete: false,
  launchChecklistIncomplete: false,
  hasWorkspaceNumber: true,
  campaigns: [{ id: 9, status: "draft", type: "live_call" }],
  unreadCount: 0,
};

function select(overrides: Partial<SelectWorkspaceTodayInput> = {}) {
  return selectWorkspaceToday({ ...baseInput, ...overrides });
}

describe("selectWorkspaceToday", () => {
  test("uses the administrator setup priority order", () => {
    expect(
      select({
        credits: 0,
        intakeIncomplete: true,
        hasWorkspaceNumber: false,
        campaigns: [],
        unreadCount: 4,
      }).kind,
    ).toBe("add_credits");
    expect(
      select({
        intakeIncomplete: true,
        hasWorkspaceNumber: false,
        campaigns: [],
        unreadCount: 4,
      }).kind,
    ).toBe("continue_setup");
    expect(
      select({
        launchChecklistIncomplete: true,
        hasWorkspaceNumber: false,
        campaigns: [],
        unreadCount: 4,
        selectedGoal: "live_call",
      }),
    ).toMatchObject({
      kind: "continue_setup",
      href: "/workspaces/workspace%20one/onboarding",
    });
    expect(
      select({
        hasWorkspaceNumber: false,
        campaigns: [],
        unreadCount: 4,
      }).kind,
    ).toBe("get_number");
    expect(select({ campaigns: [], unreadCount: 4 }).kind).toBe(
      "create_campaign",
    );
  });

  test("non-purchasing roles skip billing and administrative setup", () => {
    expect(
      select({
        userRole: "caller",
        credits: 0,
        intakeIncomplete: true,
        hasWorkspaceNumber: false,
        campaigns: [],
        unreadCount: 2,
      }),
    ).toMatchObject({
      kind: "read_messages",
      href: "/workspaces/workspace%20one/chats",
    });

    expect(
      select({
        userRole: "caller",
        credits: 0,
        intakeIncomplete: true,
        hasWorkspaceNumber: false,
        campaigns: [],
      }).kind,
    ).toBe("open_handset");
  });

  test("places unread messages ahead of a running live-call campaign", () => {
    expect(
      select({
        unreadCount: 1,
        campaigns: [{ id: 3, status: "running", type: "live_call" }],
      }).kind,
    ).toBe("read_messages");
  });

  test("keeps low credits contextual when the balance remains positive", () => {
    expect(select({ credits: 1, unreadCount: 2 }).kind).toBe("read_messages");
  });

  test("selects the lowest stable running live-call campaign id", () => {
    expect(
      select({
        campaigns: [
          { id: 12, status: "running", type: "live_call", title: "Later" },
          { id: 4, status: "running", type: "message", title: "Message" },
          { id: 3, status: "running", type: "live_call", title: "First" },
        ],
      }),
    ).toMatchObject({
      kind: "open_running_campaign",
      href: "/workspaces/workspace%20one/campaigns/3/call",
      runningCampaignTitle: "First",
    });
  });

  test("uses role-appropriate fallback actions", () => {
    expect(select({ userRole: "caller" }).kind).toBe("open_handset");
    expect(
      select({
        userRole: "member",
        credits: 0,
        intakeIncomplete: true,
        hasWorkspaceNumber: false,
        campaigns: [],
      }).kind,
    ).toBe("review_campaigns");
    expect(select({ userRole: "owner" }).kind).toBe("review_campaigns");
  });
});
