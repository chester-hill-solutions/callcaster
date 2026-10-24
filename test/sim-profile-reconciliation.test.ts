import { describe, expect, test, vi } from "vitest";
import { reconcileSimProfile, type SimReconciliationResult } from "@/lib/sim-profile-reconciliation.server";

type State = {
  users: Array<{ id: string; email: string; simMarker: string | null }>;
  workspaces: Array<{ id: string; name: string; simMarker: string | null }>;
  memberships: Array<{ workspaceId: string; userId: string; role: string; marker: string | null }>;
};

const profile = (role: "owner" | "member" = "owner", environment = "dev") => ({
  personaKey: "person-a",
  environment,
  runtimeIdentity: "dev",
  email: "person.a@dev.callcaster.ca",
  workspaceName: "SIM Workspace A",
  workspaceMarker: "sim:dev",
  expectedRole: role,
  capabilities: [],
  allowedFlows: [],
  ownedManifests: [],
  selectedProviderName: "dotenv",
  credentialName: "SIM_PERSON_A_PASSWORD",
  trafficPolicy: "local-only",
}) as never;

function repoFor(state: State) {
  return async <T>(fn: (repo: any) => Promise<T>) => fn({
    findUsers: async (email: string) => state.users.filter((row) => row.email === email),
    createUser: async (row: { id: string; email: string; marker: string }) => { state.users.push({ id: row.id, email: row.email, simMarker: row.marker }); },
    findWorkspaces: async (name: string, marker: string) => state.workspaces.filter((row) => row.name === name && (marker ? row.simMarker === marker : true)),
    findWorkspacesByMarker: async (marker: string) => state.workspaces.filter((row) => row.simMarker === marker),
    createWorkspace: async (row: { id: string; name: string; marker: string }) => { state.workspaces.push({ id: row.id, name: row.name, simMarker: row.marker }); },
    findMembership: async (workspaceId: string, userId: string) => state.memberships.find((row) => row.workspaceId === workspaceId && row.userId === userId) ?? null,
    countOwners: async (workspaceId: string) => state.memberships.filter((row) => row.workspaceId === workspaceId && row.role === "owner").length,
    createMembership: async (row: { workspaceId: string; userId: string; role: string; marker: string }) => { state.memberships.push({ ...row }); },
    updateMembership: async (workspaceId: string, userId: string, role: string) => { const row = state.memberships.find((item) => item.workspaceId === workspaceId && item.userId === userId); if (row) row.role = role; },
    audit: vi.fn(),
  });
}

describe("SIM profile reconciliation", () => {
  test("creates once and reuses on retry", async () => {
    const state: State = { users: [], workspaces: [], memberships: [] };
    const transaction = repoFor(state);
    const first = await reconcileSimProfile(profile(), transaction);
    const second = await reconcileSimProfile(profile(), transaction);
    expect(first.status).toBe("created");
    expect(second.status).toBe("reused");
    expect(state.users).toHaveLength(1);
    expect(state.workspaces).toHaveLength(1);
    expect(state.memberships).toHaveLength(1);
  });

  test("blocks unmarked and foreign workspace collisions", async () => {
    const unmarked: State = { users: [], workspaces: [{ id: "w", name: "SIM Workspace A", simMarker: null }], memberships: [] };
    await expect(reconcileSimProfile(profile(), repoFor(unmarked))).rejects.toMatchObject({ status: "blocked" });
    const foreign: State = { users: [], workspaces: [{ id: "w", name: "SIM Workspace A", simMarker: "sim:other" }], memberships: [] };
    await expect(reconcileSimProfile(profile(), repoFor(foreign))).rejects.toMatchObject({ status: "blocked" });
  });

  test("repairs marked role drift but preserves the sole owner", async () => {
    const state: State = {
      users: [{ id: "u", email: profile("member").email, simMarker: "sim:dev" }],
      workspaces: [{ id: "w", name: "SIM Workspace A", simMarker: "sim:dev" }],
      memberships: [{ workspaceId: "w", userId: "u", role: "member", marker: "sim:dev" }],
    };
    expect((await reconcileSimProfile(profile("owner"), repoFor(state))).status).toBe("repaired");
    state.memberships[0].role = "owner";
    expect((await reconcileSimProfile(profile("member"), repoFor(state))).status).toBe("drifted");
    expect(state.memberships[0].role).toBe("owner");
  });

  test("rejects production before opening a transaction", async () => {
    const transaction = vi.fn();
    await expect(reconcileSimProfile(profile("owner", "production"), transaction)).rejects.toMatchObject({ status: "blocked" });
    expect(transaction).not.toHaveBeenCalled();
  });

  test("retries a uniqueness conflict in a fresh transaction", async () => {
    const state: State = { users: [], workspaces: [], memberships: [] };
    let attempts = 0;
    const transaction = async <T>(fn: (repo: any) => Promise<T>) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("duplicate"), { code: "23505" });
      return repoFor(state)(fn);
    };
    expect((await reconcileSimProfile(profile(), transaction)).status).toBe("created");
    expect(attempts).toBe(2);
  });

  test("does not expose an arbitrary result shape", async () => {
    const result = await reconcileSimProfile(profile(), repoFor({ users: [], workspaces: [], memberships: [] }));
    expect(Object.keys(result).sort()).toEqual(["email", "environment", "persona", "role", "runtimeIdentity", "status", "workspaceMarker"]);
    expect((result as SimReconciliationResult & { userId?: string }).userId).toBeUndefined();
  });
});
