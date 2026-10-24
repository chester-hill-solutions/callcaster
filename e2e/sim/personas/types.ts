export const simPersonaRoles = ["owner", "member"] as const;
export type SimPersonaRole = (typeof simPersonaRoles)[number];

/** Opaque SIM catalog references. Secret registration belongs to shared config. */
export type SimCredentialName =
  | "SIM_PERSON_A_PASSWORD"
  | "SIM_PERSON_B_PASSWORD"
  | "SIM_PERSON_C_PASSWORD";

export type SimPersona = Readonly<{
  emailLocalPart: string;
  workspaceName: string;
  role: SimPersonaRole;
  capabilities: readonly string[];
  allowedFlows: readonly string[];
  ownsManifests: readonly string[];
  /** A name-only reference. The provider supplies the secret value later. */
  credentialName: SimCredentialName;
}>;

export type SimPersonaKey = "person-a" | "person-b" | "person-c";

export type SimPersonaCatalog = Readonly<Record<SimPersonaKey, SimPersona>>;

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
