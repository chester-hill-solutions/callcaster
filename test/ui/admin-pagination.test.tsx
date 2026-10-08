import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminUsersPanel } from "@/routes/admin+/panels/AdminUsersPanel";
import { AdminWorkspacesPanel } from "@/routes/admin+/panels/AdminWorkspacesPanel";
import { AdminCampaignsPanel } from "@/routes/admin+/panels/AdminCampaignsPanel";
import type { Tables } from "@/lib/db-types";
import type { WorkspaceAdminRow } from "@/lib/admin-workspaces";
import type { CampaignWithWorkspace } from "@/routes/admin+/admin.types";

const recordName = (index: number) =>
  `Record ${String(index + 1).padStart(2, "0")}`;

function users(count: number): Tables<"user">[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${index}`,
    username: recordName(index),
    access_level: "standard",
    created_at: "2026-01-01T00:00:00Z",
    first_name: null,
    last_name: null,
    verified_audio_numbers: [],
  }));
}

function workspaces(count: number): WorkspaceAdminRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `workspace-${index}`,
    name: recordName(index),
    ownerUsername: "Owner",
    ownerUserId: null,
    credits: 10,
    disabled: false,
    campaignCount: 0,
    memberCount: 1,
    phoneNumberCount: 0,
    createdAt: `2026-01-${String(20 - index).padStart(2, "0")}T00:00:00Z`,
    twilioSyncStatus: "never_synced",
    twilioAccountStatus: null,
    twilioLastSyncedAt: null,
    twilioLastSyncError: null,
    twilioNumberTypes: [],
    opsState: "pending",
    sendMode: "from_number",
    onboardingStatus: "pending",
    voiceReady: false,
    legacyMode: false,
  }));
}

function campaigns(count: number): CampaignWithWorkspace[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: recordName(index),
    workspace: null,
    created_at: "2026-01-01T00:00:00Z",
    status: "draft",
    type: "message",
    allow_bulk_local_send: false,
    body_text: null,
    caller_id: null,
    dial_ratio: 1,
    dial_type: "call",
    disposition_options: null,
    end_date: null,
    group_household_queue: true,
    is_sample: false,
    live_questions: null,
    message_media: null,
    next_queue_order: 1,
    schedule: null,
    script_id: null,
    sms_messaging_service_sid: null,
    sms_send_mode: null,
    sms_send_window: null,
    start_date: null,
    voicemail_drop_enabled: false,
    voicemail_file: null,
    voicedrop_audio: null,
  }));
}

const panels = [
  {
    name: "users",
    search: "Search users...",
    panel: (count: number) => (
      <AdminUsersPanel
        users={users(count)}
        workspaceUsers={[]}
        workspaces={[]}
      />
    ),
  },
  {
    name: "workspaces",
    search: "Search name, ID, or owner...",
    panel: (count: number) => (
      <AdminWorkspacesPanel workspaceRows={workspaces(count)} />
    ),
  },
  {
    name: "campaigns",
    search: "Search campaigns...",
    panel: (count: number) => (
      <AdminCampaignsPanel campaigns={campaigns(count)} workspaces={[]} />
    ),
  },
];

function mountPanel(entry: (typeof panels)[number]) {
  function Fixture() {
    const [count, setCount] = useState(12);
    return (
      <>
        <button onClick={() => setCount(3)}>Remove later records</button>
        <Tabs defaultValue={entry.name}>
          <TabsList>
            <TabsTrigger value={entry.name}>{entry.name}</TabsTrigger>
          </TabsList>
          {entry.panel(count)}
        </Tabs>
      </>
    );
  }
  const router = createMemoryRouter([{ path: "/", Component: Fixture }]);
  render(<RouterProvider router={router} />);
}

function rows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

describe.each(panels)("$name admin pagination", (entry) => {
  test("page 2 to 50 rows shows every record on page 1", async () => {
    mountPanel(entry);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(rows()).toHaveLength(2);
    expect(screen.getByText("Record 11", { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(
      await screen.findByRole("option", { name: "50 per page" }),
    );
    expect(rows()).toHaveLength(12);
    expect(screen.getByText("Record 01", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Record 12", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText("Showing 1 to 12 of 12 results"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to page 1" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("button", { name: "Go to previous page" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Go to next page" }),
    ).toBeDisabled();
  });

  test("normal paging still moves to later records and back", async () => {
    mountPanel(entry);
    const user = userEvent.setup();
    expect(rows()).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(rows()).toHaveLength(2);
    expect(
      screen.queryByText("Record 01", { exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Record 12", { exact: true })).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Go to previous page" }),
    );
    expect(rows()).toHaveLength(10);
    expect(screen.getByText("Record 01", { exact: true })).toBeInTheDocument();
  });

  test("a filter with no records shows the real empty state", async () => {
    mountPanel(entry);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    await user.type(
      screen.getByPlaceholderText(entry.search),
      "does-not-exist",
    );
    expect(
      screen.getByText(`No ${entry.name} found matching your filters`),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Record 01", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Rows per page" }),
    ).not.toBeInTheDocument();
  });

  test("fewer saved records clamp a later page to the available page", async () => {
    mountPanel(entry);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    await user.click(
      screen.getByRole("button", { name: "Remove later records" }),
    );
    expect(rows()).toHaveLength(3);
    expect(screen.getByText("Record 01", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Showing 1 to 3 of 3 results")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to page 1" }),
    ).toHaveAttribute("aria-current", "page");
  });
});


describe("admin creation controls (#2111)", () => {
  test.each([
    ["users", "Add User"],
    ["workspaces", "Add Workspace"],
  ])("%s has no creation control without a creation flow", async (name, label) => {
    const entry = panels.find((panel) => panel.name === name);
    if (!entry) throw new Error("Missing admin panel fixture");
    mountPanel(entry);
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: label, exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: label, exact: true })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(entry.search), "Record 12");
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Record 12", { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear Filters" }));
    expect(rows()).toHaveLength(10);
    expect(screen.getByText("Record 01", { exact: true })).toBeInTheDocument();
    if (name === "workspaces") {
      const sync = screen.getByRole("button", { name: "Sync Twilio" });
      expect(sync).toHaveAttribute("type", "submit");
      expect(sync.closest("form")?.querySelector('input[name="_action"]')).toHaveValue("sync_all_workspaces_twilio");
    }
  });
});
