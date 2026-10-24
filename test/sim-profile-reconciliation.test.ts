import { describe, expect, test, vi } from "vitest";
import { reconcileSimProfile, type SimReconciliationResult } from "@/lib/sim-profile-reconciliation.server";

type State = {
  users: Array<{ id: string; email: string; simMarker: string | null }>;
  workspaces: Array<{ id: string; name: string; simMarker: string | null }>;
  memberships: Array<{ workspaceId: string; userId: string; role: string; marker: string | null }>;
};

const profile = (options: Partial<{ role: "owner" | "member"; environment: string; personaKey: string; email: string; workspaceName: string; workspaceMarker: string }> = {}) => ({
  personaKey: options.personaKey ?? "person-a",
  environment: options.environment ?? "dev",
  runtimeIdentity: "dev",
  email: options.email ?? "person.a@dev.callcaster.ca",
  workspaceName: options.workspaceName ?? "SIM Workspace A",
  workspaceMarker: options.workspaceMarker ?? "sim:dev",
  expectedRole: options.role ?? "owner",
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

  test("blocks an unmarked workspace but allows a different marked workspace", async () => {
    const unmarked: State = { users: [], workspaces: [{ id: "w", name: "SIM Workspace A", simMarker: null }], memberships: [] };
    await expect(reconcileSimProfile(profile(), repoFor(unmarked))).rejects.toMatchObject({ status: "blocked" });
    const foreign: State = { users: [], workspaces: [{ id: "w", name: "SIM Workspace A", simMarker: "sim:other" }], memberships: [] };
    expect((await reconcileSimProfile(profile(), repoFor(foreign))).status).toBe("created");
    expect(foreign.workspaces).toEqual([
      { id: "w", name: "SIM Workspace A", simMarker: "sim:other" },
      expect.objectContaining({ name: "SIM Workspace A", simMarker: "sim:dev" }),
    ]);
  });

  test("keeps different workspace names isolated under one marker", async () => {
    const state: State = { users: [], workspaces: [], memberships: [] };
    expect((await reconcileSimProfile(profile(), repoFor(state))).status).toBe("created");
    expect((await reconcileSimProfile(profile({ personaKey: "person-c", email: "person.c@dev.callcaster.ca", workspaceName: "SIM Workspace B" }), repoFor(state))).status).toBe("created");
    expect((await reconcileSimProfile(profile({ personaKey: "person-c", email: "person.c@dev.callcaster.ca", workspaceName: "SIM Workspace B" }), repoFor(state))).status).toBe("reused");
    expect(state.workspaces).toHaveLength(2);
  });

  test("keeps the same workspace name isolated across runtime markers", async () => {
    const state: State = { users: [], workspaces: [], memberships: [] };
    expect((await reconcileSimProfile(profile({ workspaceMarker: "sim:sai-local", email: "person.a@sai.local" }), repoFor(state))).status).toBe("created");
    expect((await reconcileSimProfile(profile({ workspaceMarker: "sim:alex-local", email: "person.a@alex.local" }), repoFor(state))).status).toBe("created");
    expect((await reconcileSimProfile(profile({ workspaceMarker: "sim:sai-local", email: "person.a@sai.local" }), repoFor(state))).status).toBe("reused");
    expect((await reconcileSimProfile(profile({ workspaceMarker: "sim:alex-local", email: "person.a@alex.local" }), repoFor(state))).status).toBe("reused");
    expect(state.workspaces).toEqual([
      { id: expect.any(String), name: "SIM Workspace A", simMarker: "sim:sai-local" },
      { id: expect.any(String), name: "SIM Workspace A", simMarker: "sim:alex-local" },
    ]);
  });

  test("blocks duplicate exact workspace identities defensively", async () => {
    const state: State = {
      users: [{ id: "u", email: profile().email, simMarker: "sim:dev" }],
      workspaces: [
        { id: "w1", name: "SIM Workspace A", simMarker: "sim:dev" },
        { id: "w2", name: "SIM Workspace A", simMarker: "sim:dev" },
      ],
      memberships: [],
    };
    await expect(reconcileSimProfile(profile(), repoFor(state))).rejects.toMatchObject({ status: "blocked" });
  });

  test("repairs marked role drift but preserves the sole owner", async () => {
    const state: State = {
      users: [{ id: "u", email: profile({ role: "member" }).email, simMarker: "sim:dev" }],
      workspaces: [{ id: "w", name: "SIM Workspace A", simMarker: "sim:dev" }],
      memberships: [{ workspaceId: "w", userId: "u", role: "member", marker: "sim:dev" }],
    };
    expect((await reconcileSimProfile(profile(), repoFor(state))).status).toBe("repaired");
    state.memberships[0].role = "owner";
    expect((await reconcileSimProfile(profile({ role: "member" }), repoFor(state))).status).toBe("drifted");
    expect(state.memberships[0].role).toBe("owner");
  });

  test("rejects production before opening a transaction", async () => {
    const transaction = vi.fn();
    await expect(reconcileSimProfile(profile({ environment: "production" }), transaction)).rejects.toMatchObject({ status: "blocked" });
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
