import { describe, expect, it } from "vitest";
import { loadProjectConfig, resolveLocalProjectConfig } from "../config/load";
import { resolveSimProfile, SimProfileResolutionError } from "../e2e/sim/personas";

const personaKeys = ["person-a", "person-b", "person-c"] as const;
const emailLocalParts = { "person-a": "person.a", "person-b": "person.b", "person-c": "person.c" } as const;

describe("resolveSimProfile", () => {
  it.each(personaKeys)("resolves %s for local, dev, and qa", (personaKey) => {
    const local = resolveLocalProjectConfig({ devName: "sai", envName: "local" });
    const profiles = [
      resolveSimProfile({ personaKey, config: local.config, localIdentity: local.identity }),
      resolveSimProfile({ personaKey, config: loadProjectConfig("dev") }),
      resolveSimProfile({ personaKey, config: loadProjectConfig("qa") }),
    ];

    expect(profiles.map((profile) => profile.environment)).toEqual(["local", "dev", "qa"]);
    expect(profiles.map((profile) => profile.runtimeIdentity)).toEqual(["sai-local", "dev", "qa"]);
    expect(profiles.map((profile) => profile.email)).toEqual([
      `${emailLocalParts[personaKey]}@sai-local.callcaster.ca`,
      `${emailLocalParts[personaKey]}@dev.callcaster.ca`,
      `${emailLocalParts[personaKey]}@qa.callcaster.ca`,
    ]);
  });

  it("uses the injected local resolver identity for distinct developers", () => {
    const sai = resolveLocalProjectConfig({ devName: "sai", envName: "local" });
    const alex = resolveLocalProjectConfig({ devName: "alex", envName: "local" });
    const saiProfile = resolveSimProfile({ personaKey: "person-a", config: sai.config, localIdentity: sai.identity });
    const alexProfile = resolveSimProfile({ personaKey: "person-a", config: alex.config, localIdentity: alex.identity });

    expect(saiProfile.runtimeIdentity).not.toBe(alexProfile.runtimeIdentity);
    expect(saiProfile.email).not.toBe(alexProfile.email);
    expect(saiProfile.workspaceMarker).not.toBe(alexProfile.workspaceMarker);
  });

  it("rejects a local identity whose profile name belongs to another developer", () => {
    const local = resolveLocalProjectConfig({ devName: "sai", envName: "local" });
    expect(() => resolveSimProfile({
      personaKey: "person-a",
      config: local.config,
      localIdentity: { ...local.identity, profileName: "alex-local" },
    })).toThrow("SIM profile resolution failed: local identity is inconsistent");
  });

  it("propagates catalog data and is deeply immutable", () => {
    const profile = resolveSimProfile({
      personaKey: "person-b",
      config: loadProjectConfig("dev"),
      catalog: {
        "person-a": { emailLocalPart: "a", workspaceName: "A", role: "owner", capabilities: [], allowedFlows: [], ownsManifests: [], credentialName: "SIM_PERSON_A_PASSWORD" },
        "person-b": { emailLocalPart: "b", workspaceName: "B", role: "member", capabilities: ["workspace.read"], allowedFlows: ["sms-send"], ownsManifests: ["persona-b"], credentialName: "SIM_PERSON_B_PASSWORD" },
        "person-c": { emailLocalPart: "c", workspaceName: "C", role: "owner", capabilities: [], allowedFlows: [], ownsManifests: [], credentialName: "SIM_PERSON_C_PASSWORD" },
      },
    });

    expect(profile).toMatchObject({
      personaKey: "person-b",
      runtimeIdentity: "dev",
      email: "b@dev.callcaster.ca",
      workspaceName: "B",
      workspaceMarker: "sim:dev",
      expectedRole: "member",
      capabilities: ["workspace.read"],
      allowedFlows: ["sms-send"],
      ownedManifests: ["persona-b"],
      selectedProviderName: "railway",
      credentialName: "SIM_PERSON_B_PASSWORD",
      trafficPolicy: "paid-test-only",
    });
    expect(profile).not.toHaveProperty("runtimeWorkspaceId");
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.capabilities)).toBe(true);
    expect(() => (profile.capabilities as string[]).push("unsafe")).toThrow(TypeError);
  });

  it("does not emit secret values or unsafe runtime fields", () => {
    const profile = resolveSimProfile({
      personaKey: "person-a",
      config: loadProjectConfig("dev"),
    });
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toMatch(/DATABASE_URL|secret-value|https?:\/\/|\+?\d{7,}/i);
    expect(profile).not.toHaveProperty("url");
    expect(profile).not.toHaveProperty("recipient");
  });

  it.each([
    ["unknown persona", { personaKey: "person-z", config: loadProjectConfig("dev") }],
    ["incomplete configuration", { personaKey: "person-a", config: { environment: "dev" } }],
    ["invalid catalog", { personaKey: "person-a", config: loadProjectConfig("dev"), catalog: {} }],
  ])("fails safely for %s", (_name, input) => {
    expect(() => resolveSimProfile(input)).toThrow(SimProfileResolutionError);
    expect(() => resolveSimProfile(input)).toThrow(/^SIM profile resolution failed:/);
  });

  it("rejects production at the resolver boundary", () => {
    expect(() => resolveSimProfile({ personaKey: "person-a", config: loadProjectConfig("production") })).toThrow(
      "SIM profile resolution failed: production is not allowed",
    );
  });
});
