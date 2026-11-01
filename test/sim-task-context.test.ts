import { describe, expect, it, vi } from "vitest";
import { prepareSimSmsTaskContexts, prepareSimTaskContext } from "../e2e/sim/preflight";
import { assertTaskRequirement, createSimTaskContext, simTaskDefinitions } from "../e2e/sim/task-context";
import { signInForSim } from "../e2e/sim/tasks/sign-in";

vi.mock("@playwright/test", () => ({
  expect: () => ({ toHaveURL: async () => undefined }),
}));

const profile = (overrides: Record<string, unknown> = {}) => ({
  personaKey: "person-a",
  environment: "local",
  runtimeIdentity: "sai-local",
  email: "person.a@sai-local.callcaster.ca",
  workspaceName: "SIM Workspace A",
  workspaceMarker: "sim:sai-local",
  expectedRole: "owner",
  capabilities: ["workspace.read", "billing.purchaseTestCredits"],
  allowedFlows: ["sms-send"],
  ownedManifests: ["persona-a"],
  selectedProviderName: "dotenv",
  credentialName: "SIM_PERSON_A_PASSWORD",
  trafficPolicy: "local-only",
  ...overrides,
}) as never;

function runtime(overrides: Record<string, unknown> = {}) {
  const resolvedProfile = profile(overrides);
  return { profile: resolvedProfile, providerName: "dotenv", getCredential: vi.fn().mockResolvedValue("not-an-artifact") } as never;
}

describe("typed SIM task boundary", () => {
  it("sign-in derives the email from the profile and retrieves the credential once", async () => {
    const credential = vi.fn().mockResolvedValue("password-value");
    const baseRuntime = runtime();
    const context = createSimTaskContext({ runtime: { ...baseRuntime, getCredential: credential }, workspaceId: "workspace-id" } as never);
    const fills: string[] = [];
    const page = {
      goto: vi.fn(),
      locator: vi.fn((selector: string) => ({ fill: vi.fn((value: string) => { fills.push(`${selector}:${value}`); }) })),
      getByRole: vi.fn(() => ({ click: vi.fn() })),
    } as never;

    await signInForSim(page, { ...context, runtime: { ...baseRuntime, getCredential: credential } } as never);

    expect(fills).toEqual([
      "#email:person.a@sai-local.callcaster.ca",
      "#password:password-value",
    ]);
    expect(credential).toHaveBeenCalledTimes(1);
  });

  it("does not give non-sign-in tasks a password accessor", () => {
    expect(createSimTaskContext({ runtime: runtime(), workspaceId: "w" }).runtime).not.toHaveProperty("getCredential");
    expect(simTaskDefinitions.credits).not.toHaveProperty("getCredential");
    expect(simTaskDefinitions.sms).not.toHaveProperty("getCredential");
  });

  it("enforces member and owner requirements without elevation", () => {
    const member = { profile: profile({ expectedRole: "member", capabilities: ["message.send"] }) };
    expect(() => assertTaskRequirement(member, simTaskDefinitions.sms.requires)).not.toThrow();
    expect(() => assertTaskRequirement(member, simTaskDefinitions.credits.requires)).toThrow(/owner role/);
  });

  it("refuses an unsafe policy before task context creation", async () => {
    const context = runtime({ trafficPolicy: "disabled" });
    const status = vi.fn();
    await expect(prepareSimTaskContext(context, ["signIn"], { status, access: vi.fn() })).rejects.toThrow(/disabled/);
    expect(status).not.toHaveBeenCalled();
  });

  it("stops on profile status failure before any access check", async () => {
    const status = vi.fn().mockResolvedValue({ status: "blocked" });
    const access = vi.fn();
    await expect(prepareSimTaskContext(runtime(), ["signIn"], { status, access })).rejects.toThrow(/not ready/);
    expect(access).not.toHaveBeenCalled();
  });

  it("runs status and every access check before returning a browser task context", async () => {
    const context = runtime();
    const status = vi.fn().mockResolvedValue({ status: "ready", workspaceId: "workspace-id" });
    const access = vi.fn().mockResolvedValue({ allowed: true, status: "ready", reason: "ready" });
    const taskContext = await prepareSimTaskContext(context, ["signIn", "contactList", "credits", "sms"], { status, access });
    expect(status).toHaveBeenCalledOnce();
    expect(access).toHaveBeenCalledTimes(4);
    expect(taskContext.workspaceId).toBe("workspace-id");
    expect(Object.isFrozen(taskContext)).toBe(true);
  });

  it("preflights owner billing and member SMS work as separate contexts", async () => {
    const status = vi.fn().mockResolvedValue({ status: "ready", workspaceId: "shared-workspace" });
    const access = vi.fn().mockResolvedValue({ allowed: true, status: "ready", reason: "ready" });
    const owner = runtime();
    const member = runtime({
      personaKey: "person-b",
      expectedRole: "member",
      email: "person.b@sai-local.callcaster.ca",
      capabilities: ["workspace.read", "audience.write", "message.send"],
      credentialName: "SIM_PERSON_B_PASSWORD",
    });

    const contexts = await prepareSimSmsTaskContexts({ owner, member }, { status, access });

    expect(contexts.owner.profile.personaKey).toBe("person-a");
    expect(contexts.owner.profile.expectedRole).toBe("owner");
    expect(contexts.member.profile.personaKey).toBe("person-b");
    expect(contexts.member.profile.expectedRole).toBe("member");
    expect(access.mock.calls.map(([profile, capability]) => [profile.personaKey, capability]).sort((a, b) => a.join().localeCompare(b.join()))).toEqual([
      ["person-a", "billing.purchaseTestCredits"],
      ["person-b", "audience.write"],
      ["person-b", "message.send"],
      ["person-a", "workspace.read"],
      ["person-b", "workspace.read"],
    ].sort((a, b) => a.join().localeCompare(b.join())));
  });

  it("rejects owner and member contexts that resolve different workspaces", async () => {
    const status = vi.fn()
      .mockResolvedValueOnce({ status: "ready", workspaceId: "owner-workspace" })
      .mockResolvedValueOnce({ status: "ready", workspaceId: "member-workspace" });
    const access = vi.fn().mockResolvedValue({ allowed: true, status: "ready", reason: "ready" });

    await expect(prepareSimSmsTaskContexts({ owner: runtime(), member: runtime({ personaKey: "person-b", expectedRole: "member" }) }, { status, access }))
      .rejects.toThrow(/same workspace/);
  });
});
