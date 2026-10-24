import { describe, expect, test, vi } from "vitest";
import {
  checkSimProfileAccess,
  getSimProfileStatus,
  getSimProfileStatusInDatabase,
  type SimProfileStatusRepository,
} from "@/lib/sim-profile-status.server";

vi.mock("@/server/db", () => {
  throw new Error("database repository must not be constructed");
});

const makeProfile = (overrides: Record<string, unknown> = {}) => ({
  personaKey: "person-a",
  environment: "dev",
  runtimeIdentity: "dev",
  email: "person.a@dev.callcaster.ca",
  workspaceName: "SIM Workspace A",
  workspaceMarker: "sim:dev",
  expectedRole: "owner",
  capabilities: ["workspace.read", "billing.purchaseTestCredits", "simulation.manage"],
  allowedFlows: ["sms-send"],
  ownedManifests: ["persona-a"],
  selectedProviderName: "railway",
  credentialName: "SIM_PERSON_A_PASSWORD",
  trafficPolicy: "paid-test-only",
  ...overrides,
}) as never;

type State = {
  users: Array<{ id: string; email: string; simMarker: string | null }>;
  applicationUsers: Array<{ id: string; simMarker: string | null }>;
  workspaces: Array<{ id: string; name: string; simMarker: string | null }>;
  memberships: Array<{ workspaceId: string; userId: string; role: string; marker: string | null }>;
};

function repository(state: State): SimProfileStatusRepository {
  return {
    findUsersByEmail: async (email) => state.users.filter((row) => row.email === email),
    findApplicationUserById: async (userId) => state.applicationUsers.find((row) => row.id === userId) ?? null,
    findWorkspacesByNameAndMarker: async (name, marker) => state.workspaces.filter((row) => row.name === name && row.simMarker === marker),
    findUnmarkedWorkspacesByName: async (name) => state.workspaces.filter((row) => row.name === name && row.simMarker === null),
    findMembership: async (workspaceId, userId) => state.memberships.find((row) => row.workspaceId === workspaceId && row.userId === userId) ?? null,
  };
}

const completeState = (): State => ({
  users: [{ id: "u", email: "person.a@dev.callcaster.ca", simMarker: "sim:dev" }],
  applicationUsers: [{ id: "u", simMarker: "sim:dev" }],
  workspaces: [{ id: "w", name: "SIM Workspace A", simMarker: "sim:dev" }],
  memberships: [{ workspaceId: "w", userId: "u", role: "owner", marker: "sim:dev" }],
});

describe("SIM profile status and access", () => {
  test("returns ready metadata for a correctly marked owner", async () => {
    const result = await getSimProfileStatus(makeProfile(), repository(completeState()));
    expect(result).toMatchObject({ status: "ready", workspaceId: "w", actualRole: "owner", providerName: "railway", credentialName: "SIM_PERSON_A_PASSWORD" });
  });

  test.each([
    ["user", { users: [] }],
    ["workspace", { workspaces: [] }],
    ["membership", { memberships: [] }],
  ])("reports missing when %s is absent", async (_name, change) => {
    const state = { ...completeState(), ...change };
    expect((await getSimProfileStatus(makeProfile(), repository(state))).status).toBe("missing");
  });

  test.each([
    ["unmarked user", { users: [{ id: "u", email: "person.a@dev.callcaster.ca", simMarker: null }] }],
    ["foreign user", { users: [{ id: "u", email: "person.a@dev.callcaster.ca", simMarker: "sim:other" }] }],
    ["unmarked workspace", { workspaces: [{ id: "w", name: "SIM Workspace A", simMarker: null }] }],
    ["foreign membership", { memberships: [{ workspaceId: "w", userId: "u", role: "owner", marker: "sim:other" }] }],
  ])("blocks %s", async (_name, change) => {
    const state = { ...completeState(), ...change };
    expect((await getSimProfileStatus(makeProfile(), repository(state))).status).toBe("blocked");
  });

  test.each([
    ["missing app user", { applicationUsers: [] }],
    ["unmarked app user", { applicationUsers: [{ id: "u", simMarker: null }] }],
    ["foreign app user", { applicationUsers: [{ id: "u", simMarker: "sim:other" }] }],
  ])("handles %s", async (_name, change) => {
    const state = { ...completeState(), ...change };
    const result = await getSimProfileStatus(makeProfile(), repository(state));
    expect(result.status).toBe(change.applicationUsers.length === 0 ? "missing" : "blocked");
  });

  test("does not block a same-name workspace with a different non-null marker", async () => {
    const state = completeState();
    state.workspaces.unshift({ id: "foreign", name: "SIM Workspace A", simMarker: "sim:other" });
    expect((await getSimProfileStatus(makeProfile(), repository(state))).status).toBe("ready");
  });

  test("reports role and profile capability/flow drift without repairing", async () => {
    const state = completeState();
    const membership = state.memberships[0];
    if (!membership) throw new Error("fixture membership missing");
    membership.role = "member";
    const result = await getSimProfileStatus(makeProfile(), repository(state));
    expect(result).toMatchObject({ status: "drifted", actualRole: "member" });
    expect(membership.role).toBe("member");
  });

  test("requires both the catalog capability and canonical role floor", async () => {
    const profile = makeProfile({ expectedRole: "member", capabilities: ["message.send"], allowedFlows: ["sms-send"] });
    const state = completeState();
    const user = state.users[0];
    const membership = state.memberships[0];
    if (!user || !membership) throw new Error("fixture identity missing");
    user.email = profile.email;
    membership.userId = "u";
    membership.role = "member";
    const status = await getSimProfileStatus(profile, repository(state));
    expect((await checkSimProfileAccess(profile, repository(state), "message.send")).allowed).toBe(true);
    expect((await checkSimProfileAccess(profile, repository(state), "billing.purchaseTestCredits")).reason).toBe("capability-not-declared");
    expect((await checkSimProfileAccess(profile, repository(state), "message.send", "not-declared")).reason).toBe("flow-not-declared");
  });

  test("denies owner-only access to a marked member", async () => {
    const profile = makeProfile({ expectedRole: "member", capabilities: ["billing.purchaseTestCredits"] });
    const state = completeState();
    const membership = state.memberships[0];
    if (!membership) throw new Error("fixture membership missing");
    membership.role = "member";
    const status = await getSimProfileStatus(profile, repository(state));
    expect(status.status).toBe("ready");
    expect((await checkSimProfileAccess(profile, repository(state), "billing.purchaseTestCredits")).allowed).toBe(false);
  });

  test("rejects production before constructing the database repository", async () => {
    const profile = makeProfile({ environment: "production" });
    await expect(getSimProfileStatusInDatabase(profile)).rejects.toThrow("not allowed for production");
  });

  test("does not expose secret-shaped values in safe profile output", () => {
    const profile = makeProfile();
    expect(JSON.stringify(profile)).not.toMatch(/password-value|token|recipient|DATABASE_URL/i);
  });
});
