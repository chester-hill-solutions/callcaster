import { describe, expect, it, vi } from "vitest";
import { prepareSimSmsTaskContext } from "../e2e/sim/preflight";
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
  capabilities: ["workspace.read", "billing.purchaseTestCredits", "audience.write", "message.send"],
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
    await expect(prepareSimSmsTaskContext(context, { status, access: vi.fn() })).rejects.toThrow(/disabled/);
    expect(status).not.toHaveBeenCalled();
  });

  it("stops on profile status failure before any access check", async () => {
    const status = vi.fn().mockResolvedValue({ status: "blocked" });
    const access = vi.fn();
    await expect(prepareSimSmsTaskContext(runtime(), { status, access })).rejects.toThrow(/not ready/);
    expect(access).not.toHaveBeenCalled();
  });

  it("runs status and every access check before returning a browser task context", async () => {
    const context = runtime();
    const status = vi.fn().mockResolvedValue({ status: "ready", workspaceId: "workspace-id" });
    const access = vi.fn().mockResolvedValue({ allowed: true, status: "ready", reason: "ready" });
    const taskContext = await prepareSimSmsTaskContext(context, { status, access });
    expect(status).toHaveBeenCalledOnce();
    expect(access).toHaveBeenCalledTimes(4);
    expect(taskContext.workspaceId).toBe("workspace-id");
    expect(Object.isFrozen(taskContext)).toBe(true);
  });
});
