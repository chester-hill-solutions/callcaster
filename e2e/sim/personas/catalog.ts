import { deepFreeze, type SimPersonaCatalog } from "./types";

/**
 * Logical SIM identities only. Environment facts, runtime IDs, and secret
 * values belong to later resolution/configuration work, not this catalog.
 *
 * The permissions match the roadmap's first task declarations. `person-a`
 * owns owner-only billing and simulation work. `person-b` is a real member
 * (the roadmap's human "Agent" scenario) for audience and SMS work. `person-c`
 * proves that a second owner/workspace relationship can be declared without
 * granting a flow that does not exist yet.
 */
export const simPersonas = deepFreeze({
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
} satisfies SimPersonaCatalog);
