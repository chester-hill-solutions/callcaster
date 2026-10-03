import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "./helpers/route-result";
import { withAdminRouteArgs } from "./helpers/route-context-mock";
vi.unmock("@/lib/api-auth.server");
const boundary = vi.hoisted(() => ({
  session: vi.fn(),
  listWorkspaces: vi.fn(),
  membership: vi.fn(),
  invites: vi.fn(),
  detail: vi.fn(),
  rawWorkspace: vi.fn(),
  user: vi.fn(),
  account: vi.fn(),
  accounts: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: boundary.session,
}));
vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/workspace-members-db.server")
  >()),
  listAllWorkspacesOrdered: boundary.listWorkspaces,
  listAllUsersOrdered: async () => [userRow("sudo-admin", "sudo")],
  listAllWorkspaceUsers: async () => [
    {
      id: "member",
      user_id: "sudo-admin",
      workspace_id: "workspace-id",
      role: "owner",
    },
  ],
  listAllWorkspaceNumbers: async () => [],
  listAllCampaignsOrdered: async () => [],
  listUserWorkspaceMembershipsWithWorkspace: boundary.membership,
  getWorkspaceWithCampaigns: boundary.detail,
  getWorkspaceById: boundary.rawWorkspace,
  getUserById: boundary.user,
  listAdminWorkspaceUsersWithUser: async () => [],
  listWorkspaceNumbersForWorkspace: async () => [],
}));
vi.mock("@/lib/workspace-invitations.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/workspace-invitations.server")
  >()),
  listPendingInvitesForUsername: boundary.invites,
}));
vi.mock("@/lib/billing-reconciliation.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/billing-reconciliation.server")
  >()),
  loadBillingReconciliationReport: async () => null,
}));
vi.mock("@/lib/admin-jobs.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-jobs.server")>()),
  listRecentDeadLetteredJobs: async () => [],
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: boundary.client,
  getWorkspaceTwilioPortalSnapshot: async () => null,
}));

function userRow(id: string, access_level = "standard") {
  return {
    id,
    username: `${id}@example.com`,
    access_level,
    first_name: null,
    last_name: null,
    created_at: new Date("2026-10-01T12:00:00Z"),
  };
}
function fullWorkspace() {
  return {
    id: "workspace-id",
    name: "Visible workspace",
    credits: 42,
    disabled: false,
    created_at: new Date("2026-10-01T12:00:00Z"),
    feature_flags: {},
    coaching_config: null,
    key: "secret-key-sentinel",
    token: "secret-token-sentinel",
    stripe_id: "secret-stripe-sentinel",
    twilio_data: {
      sid: "AC_workspace",
      authToken: "secret-auth-sentinel",
      portalSync: {
        lastSyncStatus: "healthy",
        accountStatus: "active",
        numberTypes: ["local"],
      },
    },
  };
}
const allowedWorkspaceKeys = [
  "coaching_config",
  "created_at",
  "credits",
  "disabled",
  "feature_flags",
  "id",
  "name",
];
function noSecrets(value: unknown) {
  if (Array.isArray(value)) {
    for (const child of value) noSecrets(child);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      expect([
        "key",
        "token",
        "twilio_data",
        "stripe_id",
        "authToken",
        "token_hash",
      ]).not.toContain(key);
      noSecrets(child);
    }
  }
  if (typeof value === "string") expect(value).not.toContain("secret-");
}
beforeEach(() => {
  boundary.session.mockResolvedValue({
    user: { id: "sudo-admin" },
    headers: new Headers(),
  });
  boundary.user.mockImplementation(async (id: string) =>
    userRow(id, id === "sudo-admin" ? "sudo" : "standard"),
  );
  boundary.listWorkspaces.mockResolvedValue([fullWorkspace()]);
  boundary.membership.mockResolvedValue([
    {
      id: "member",
      workspace_id: "workspace-id",
      user_id: "target-user",
      role_id: "member",
      created_at: new Date(),
      workspace: fullWorkspace(),
    },
  ]);
  boundary.invites.mockResolvedValue([
    {
      invite: {
        id: "invite-id",
        workspace_id: "workspace-id",
        email: "target-user@example.com",
        role_id: "member",
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date("2026-10-10"),
        invited_by_user_id: "sudo-admin",
        token_hash: "secret-invitation-sentinel",
      },
      workspace: fullWorkspace(),
    },
  ]);
  boundary.detail.mockResolvedValue({ ...fullWorkspace(), campaign: [] });
  boundary.rawWorkspace.mockResolvedValue(fullWorkspace());
  boundary.account.mockResolvedValue({
    sid: "AC_workspace",
    friendlyName: "Visible account",
    status: "active",
    type: "Subaccount",
    dateCreated: new Date("2026-10-01"),
    authToken: "secret-provider-sentinel",
    ownerAccountSid: "AC_parent",
    unexpected: "secret-extra-sentinel",
  });
  boundary.accounts.mockImplementation(() => ({ fetch: boundary.account }));
  boundary.client.mockResolvedValue({
    username: "SK_workspace_key",
    accountSid: "AC_workspace",
    api: { v2010: { accounts: boundary.accounts } },
    incomingPhoneNumbers: { list: async () => [] },
    usage: { records: { list: async () => [] } },
  });
});
const surfaces = [
  {
    name: "dashboard UI",
    path: "/admin",
    type: "dashboard",
    api: false,
    load: () => import("../app/routes/admin+/route.loader.server"),
  },
  {
    name: "dashboard JSON",
    path: "/api/admin/dashboard",
    type: "dashboard",
    api: true,
    load: () => import("../app/routes/api+/admin+/dashboard.loader.server"),
  },
  {
    name: "detail",
    path: "/admin/workspaces/workspace-id",
    type: "detail",
    api: false,
    load: () =>
      import("../app/routes/admin+/workspaces/$workspaceId.loader.server"),
  },
  {
    name: "campaign subpage",
    path: "/admin/workspaces/workspace-id/campaigns",
    type: "campaigns",
    api: false,
    load: () =>
      import("../app/routes/admin+/workspaces/$workspaceId/campaigns.loader.server"),
  },
  {
    name: "user workspaces UI",
    path: "/admin/users/target-user/workspaces",
    type: "user",
    api: false,
    load: () =>
      import("../app/routes/admin+/users/$userId/workspaces.loader.server"),
  },
  {
    name: "user workspaces JSON",
    path: "/api/admin/users/target-user/workspaces",
    type: "user",
    api: true,
    load: () =>
      import("../app/routes/api+/admin+/users+/$userId/workspaces.action.server"),
  },
];
for (const surface of surfaces)
  describe(surface.name, () => {
    async function response() {
      const { loader } = await surface.load();
      const args = await withAdminRouteArgs(
        routeArgs(new Request(`http://localhost${surface.path}`), {
          workspaceId: "workspace-id",
          userId: "target-user",
        }),
      );
      return asRouteResponse(loader(args));
    }
    test("complete payload keeps display fields and excludes every credential at every depth", async () => {
      const result = await response();
      expect(result.status).toBe(200);
      const raw = await result.json();
      const payload = JSON.parse(JSON.stringify(raw));
      noSecrets(payload);
      const rootKeys =
        surface.type === "dashboard"
          ? [
              "workspaces",
              "users",
              "workspaceUsers",
              "workspaceNumbers",
              "workspaceRows",
              "campaigns",
              "deadLetteredJobs",
              "stats",
              ...(surface.api ? [] : ["user"]),
            ]
          : surface.type === "detail"
            ? [
                "user",
                "workspace",
                "workspaceUsers",
                "phoneNumbers",
                "twilioAccountInfo",
                "twilioNumbers",
                "twilioUsage",
                "twilioPortalSnapshot",
              ]
            : surface.type === "campaigns"
              ? ["workspace"]
              : surface.api
                ? [
                    "target_user",
                    "all_workspaces",
                    "user_workspaces",
                    "pending_invites",
                  ]
                : [
                    "currentUser",
                    "targetUser",
                    "allWorkspaces",
                    "userWorkspaces",
                    "pendingInvites",
                  ];
      expect(Object.keys(payload).sort()).toEqual(rootKeys.sort());
      const ws =
        surface.type === "dashboard"
          ? payload.workspaces[0]
          : surface.type === "user"
            ? (payload.allWorkspaces ?? payload.all_workspaces)[0]
            : payload.workspace;
      expect(Object.keys(ws).sort()).toEqual(
        surface.type === "dashboard" ||
          surface.type === "detail" ||
          surface.type === "campaigns"
          ? [...allowedWorkspaceKeys, "campaign"].sort()
          : allowedWorkspaceKeys,
      );
      expect(ws).toMatchObject({
        id: "workspace-id",
        name: "Visible workspace",
        credits: 42,
        disabled: false,
      });
      if (surface.type === "dashboard")
        expect(payload.workspaceRows[0]).toMatchObject({
          twilioSyncStatus: "healthy",
          twilioAccountStatus: "active",
          memberCount: 1,
        });
      if (surface.type === "detail") {
        expect(boundary.accounts).toHaveBeenCalledWith("AC_workspace");
        expect(Object.keys(payload.twilioAccountInfo).sort()).toEqual([
          "dateCreated",
          "friendlyName",
          "sid",
          "status",
          "type",
        ]);
        expect(payload.twilioAccountInfo.friendlyName).toBe("Visible account");
      }
      if (surface.type === "user") {
        const memberships = payload.userWorkspaces ?? payload.user_workspaces;
        const invitations = payload.pendingInvites ?? payload.pending_invites;
        expect(Object.keys(memberships[0].workspace).sort()).toEqual(
          allowedWorkspaceKeys,
        );
        expect(Object.keys(invitations[0].workspace).sort()).toEqual(
          allowedWorkspaceKeys,
        );
        expect(invitations[0]).toMatchObject({
          id: "invite-id",
          email: "target-user@example.com",
          role: "member",
          status: "pending",
        });
        expect(Object.keys(invitations[0]).sort()).toEqual([
          "created_at",
          "email",
          "expires_at",
          "id",
          "invited_by_user_id",
          "role",
          "role_id",
          "status",
          "updated_at",
          "workspace",
          "workspace_id",
        ]);
      }
    });
    if (surface.api) {
      test("unsigned request is refused before admin payload reads", async () => {
        boundary.session.mockResolvedValue({
          user: null,
          headers: new Headers(),
        });
        expect((await response()).status).toBe(401);
        expect(boundary.listWorkspaces).not.toHaveBeenCalled();
      });
      test("standard user is refused before admin payload reads", async () => {
        boundary.session.mockResolvedValue({
          user: { id: "standard-user" },
          headers: new Headers(),
        });
        expect((await response()).status).toBe(403);
        expect(boundary.listWorkspaces).not.toHaveBeenCalled();
      });
    }
  });
test("missing detail workspace retains the admin redirect without a provider call", async () => {
  boundary.detail.mockResolvedValue(null);
  const { loader } =
    await import("../app/routes/admin+/workspaces/$workspaceId.loader.server");
  const args = await withAdminRouteArgs(
    routeArgs(new Request("http://localhost/admin/workspaces/missing"), {
      workspaceId: "missing",
    }),
  );
  const response = await asRouteResponse(loader(args));
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe("/admin?tab=workspaces");
  expect(boundary.client).not.toHaveBeenCalled();
});

test("the server-only Twilio portal helper keeps credential access but projects the provider account", async () => {
  const { loadTwilioData } =
    await import("../app/routes/admin+/workspaces/$workspaceId/loadTwilioData.server");
  const data = JSON.parse(JSON.stringify(await loadTwilioData("workspace-id")));
  noSecrets(data);
  expect(Object.keys(data.twilioAccountInfo).sort()).toEqual([
    "dateCreated",
    "friendlyName",
    "sid",
    "status",
    "type",
  ]);
  expect(data.twilioAccountInfo).toMatchObject({
    sid: "AC_workspace",
    friendlyName: "Visible account",
  });
  expect(boundary.account).toHaveBeenCalledTimes(1);
  expect(boundary.accounts).toHaveBeenCalledWith("AC_workspace");
});
test("provider failure keeps the detail payload safe and its workspace display usable", async () => {
  boundary.account.mockRejectedValue(new Error("Provider unavailable"));
  const { loader } =
    await import("../app/routes/admin+/workspaces/$workspaceId.loader.server");
  const result = await asRouteResponse(
    loader(
      await withAdminRouteArgs(
        routeArgs(
          new Request("http://localhost/admin/workspaces/workspace-id"),
          { workspaceId: "workspace-id" },
        ),
      ),
    ),
  );
  const data = JSON.parse(JSON.stringify(await result.json()));
  noSecrets(data);
  expect(result.status).toBe(200);
  expect(data.twilioAccountInfo).toBeNull();
  expect(data.workspace.name).toBe("Visible workspace");
});
