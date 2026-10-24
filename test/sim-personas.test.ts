import { describe, expect, it } from "vitest";
import { simPersonas } from "../e2e/sim/personas";

const credentialNames = ["SIM_PERSON_A_PASSWORD", "SIM_PERSON_B_PASSWORD", "SIM_PERSON_C_PASSWORD"] as const;

describe("initial SIM persona catalog", () => {
  it("defines the three contract personas and no runtime data", () => {
    expect(simPersonas).toEqual({
      "person-a": {
        emailLocalPart: "person.a",
        workspaceName: "SIM Workspace A",
        role: "owner",
        capabilities: ["workspace.read", "billing.purchaseTestCredits", "simulation.manage"],
        allowedFlows: ["sms-send"],
        ownsManifests: ["persona-a"],
        credentialName: "SIM_PERSON_A_PASSWORD",
      },
      "person-b": {
        emailLocalPart: "person.b",
        workspaceName: "SIM Workspace A",
        role: "member",
        capabilities: ["workspace.read", "audience.write", "campaign.write", "message.send"],
        allowedFlows: ["sms-send"],
        ownsManifests: ["persona-b"],
        credentialName: "SIM_PERSON_B_PASSWORD",
      },
      "person-c": {
        emailLocalPart: "person.c",
        workspaceName: "SIM Workspace B",
        role: "owner",
        capabilities: ["workspace.read"],
        allowedFlows: [],
        ownsManifests: [],
        credentialName: "SIM_PERSON_C_PASSWORD",
      },
    });

    const forbiddenKeys = /^(?:phone|url|environment|uuid|token|api|twiml|value)$/i;
    for (const persona of Object.values(simPersonas)) {
      expect(Object.keys(persona).some((key) => forbiddenKeys.test(key))).toBe(false);
      expect(persona.role).not.toBe("agent");
      expect(JSON.stringify(persona)).not.toMatch(/https?:|\+\d{7,}|[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    }
  });

  it("keeps the catalog deeply immutable", () => {
    expect(Object.isFrozen(simPersonas)).toBe(true);
    for (const persona of Object.values(simPersonas)) {
      expect(Object.isFrozen(persona)).toBe(true);
      expect(Object.isFrozen(persona.capabilities)).toBe(true);
      expect(Object.isFrozen(persona.allowedFlows)).toBe(true);
      expect(Object.isFrozen(persona.ownsManifests)).toBe(true);
    }
  });

  it("keeps credentials as declared SIM secret references", () => {
    expect(Object.values(simPersonas).map((persona) => persona.credentialName)).toEqual(credentialNames);
    for (const name of credentialNames) expect(name).toMatch(/^SIM_PERSON_[ABC]_PASSWORD$/);
  });

  it("distinguishes shared member access from the separate owner workspace", () => {
    expect(simPersonas["person-a"].workspaceName).toBe(simPersonas["person-b"].workspaceName);
    expect(simPersonas["person-a"].role).toBe("owner");
    expect(simPersonas["person-b"].role).toBe("member");
    expect(simPersonas["person-b"].capabilities).toContain("message.send");
    expect(simPersonas["person-a"].capabilities).toContain("billing.purchaseTestCredits");
    expect(simPersonas["person-c"].workspaceName).toBe("SIM Workspace B");
    expect(simPersonas["person-c"].workspaceName).not.toBe(simPersonas["person-a"].workspaceName);
    expect(simPersonas["person-c"].role).toBe("owner");
  });
});
