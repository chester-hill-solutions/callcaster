import { describe, expect, it, vi } from "vitest";
import { ensureSimTwilioProvisioning, simTwilioStatus } from "@/lib/sim-twilio-provisioning.server";
import type { ResolvedSimProfile } from "../e2e/sim/personas";

const localProfile = {
  personaKey: "person-a", environment: "local", runtimeIdentity: "sai-local",
  email: "person-a@sai-local.test", workspaceName: "Sim Workspace A",
  workspaceMarker: "sim:sai-local", expectedRole: "owner", capabilities: [],
  allowedFlows: [], ownedManifests: [], selectedProviderName: "dotenv",
  credentialName: "SIM_PERSON_A_PASSWORD", trafficPolicy: "local-only",
} as ResolvedSimProfile;

describe("SIM Twilio provisioning boundary", () => {
  it.each([
    { profile: { ...localProfile, environment: "dev" }, env: {} },
    { profile: { ...localProfile, environment: "qa" }, env: {} },
    { profile: localProfile, env: { RAILWAY_ENVIRONMENT: "local" } },
    { profile: { ...localProfile, trafficPolicy: "disabled" }, env: {} },
  ])("refuses before provider access for unsafe runtime", async ({ profile, env }) => {
    const original = { NODE_ENV: process.env.NODE_ENV, RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT };
    Object.assign(process.env, env);
    const providerFactory = vi.fn();
    await expect(ensureSimTwilioProvisioning(profile as ResolvedSimProfile, "workspace-id", providerFactory)).rejects.toThrow("approved local profile");
    expect(providerFactory).not.toHaveBeenCalled();
    if (original.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.NODE_ENV;
    if (original.RAILWAY_ENVIRONMENT === undefined) delete process.env.RAILWAY_ENVIRONMENT; else process.env.RAILWAY_ENVIRONMENT = original.RAILWAY_ENVIRONMENT;
  });

  it.each([
    [{}, "missing", false, false, false],
    [{ sid: "AC-hidden", authToken: "secret" }, "partial", true, false, false],
    [{ sid: "AC-hidden", authToken: "secret", key: "SK-hidden", token: "secret", onboarding: { messagingService: { serviceSid: "MG-hidden" } } }, "ready", true, true, true],
    [{ sid: "AC-hidden", authToken: "secret", simTwilioKeyProvisioning: "pending" }, "manual-recovery", true, false, false],
  ] as const)("reports only readiness for provider fields", (data, status, subaccount, apiKey, messagingService) => {
    expect(simTwilioStatus(localProfile, data as Record<string, unknown>)).toEqual({
      status, persona: "person-a", profile: "sai-local", marker: "sim:sai-local", subaccount, apiKey, messagingService,
    });
  });
});
