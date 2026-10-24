import {
  simPersonaRoles,
  type SimPersonaCatalog,
} from "./types";

const supportedPersonaKeys = ["person-a", "person-b", "person-c"] as const;
const supportedCapabilities = [
  "workspace.read",
  "billing.purchaseTestCredits",
  "simulation.manage",
  "audience.write",
  "campaign.write",
  "message.send",
] as const;
const supportedFlows = ["sms-send"] as const;
const supportedManifestIdentifiers = ["persona-a", "persona-b"] as const;
const supportedCredentialNames = [
  "SIM_PERSON_A_PASSWORD",
  "SIM_PERSON_B_PASSWORD",
  "SIM_PERSON_C_PASSWORD",
] as const;
const personaFields = [
  "emailLocalPart",
  "workspaceName",
  "role",
  "capabilities",
  "allowedFlows",
  "ownsManifests",
  "credentialName",
] as const;

type ValidationCode =
  | "catalog-not-object"
  | "persona-key-grammar"
  | "persona-keys"
  | "persona-not-object"
  | "persona-fields"
  | "email-local-part"
  | "workspace-name"
  | "role"
  | "duplicate-email-local-part"
  | "capability"
  | "flow"
  | "manifest"
  | "credential-name";

export type SimPersonaCatalogValidationIssue = Readonly<{
  code: ValidationCode;
  personaIndex?: number;
}>;

export type SimPersonaCatalogValidationResult = Readonly<{
  valid: boolean;
  personaCount: number;
  personaKeys: readonly string[];
  issues: readonly SimPersonaCatalogValidationIssue[];
}>;

export class SimPersonaCatalogValidationError extends Error {
  readonly issues: readonly SimPersonaCatalogValidationIssue[];

  constructor(issues: readonly SimPersonaCatalogValidationIssue[]) {
    super(`SIM persona catalog validation failed (${issues.map(({ code }) => code).join(", ")})`);
    this.name = "SimPersonaCatalogValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.getOwnPropertyNames(value).every((key) => allowed.includes(key));
}

function hasOnlyStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasDuplicate(value: readonly string[]): boolean {
  return new Set(value).size !== value.length;
}

function addIssue(
  issues: SimPersonaCatalogValidationIssue[],
  code: ValidationCode,
  personaIndex?: number,
): void {
  issues.push(personaIndex === undefined ? { code } : { code, personaIndex });
}

function validatePersonaFields(
  persona: Record<string, unknown>,
  personaIndex: number,
  emailLocalParts: Set<string>,
  issues: SimPersonaCatalogValidationIssue[],
): void {
  if (!hasOnlyKeys(persona, personaFields)) addIssue(issues, "persona-fields", personaIndex);

  const emailLocalPart = persona.emailLocalPart;
  if (
    typeof emailLocalPart !== "string" ||
    emailLocalPart.length > 64 ||
    !/^[a-z0-9](?:[a-z0-9.!#$%&'*+/=?^_`{|}~-]*[a-z0-9])?$/.test(emailLocalPart) ||
    emailLocalPart.includes("..")
  ) {
    addIssue(issues, "email-local-part", personaIndex);
  } else if (emailLocalParts.has(emailLocalPart)) {
    addIssue(issues, "duplicate-email-local-part", personaIndex);
  } else {
    emailLocalParts.add(emailLocalPart);
  }

  if (typeof persona.workspaceName !== "string" || persona.workspaceName.trim() === "") {
    addIssue(issues, "workspace-name", personaIndex);
  }
  if (!simPersonaRoles.includes(persona.role as (typeof simPersonaRoles)[number])) {
    addIssue(issues, "role", personaIndex);
  }
  if (
    !hasOnlyStrings(persona.capabilities) ||
    hasDuplicate(persona.capabilities) ||
    persona.capabilities.some((value) => !supportedCapabilities.includes(value as (typeof supportedCapabilities)[number]))
  ) {
    addIssue(issues, "capability", personaIndex);
  }
  if (
    !hasOnlyStrings(persona.allowedFlows) ||
    hasDuplicate(persona.allowedFlows) ||
    persona.allowedFlows.some((value) => !supportedFlows.includes(value as (typeof supportedFlows)[number]))
  ) {
    addIssue(issues, "flow", personaIndex);
  }
  if (
    !hasOnlyStrings(persona.ownsManifests) ||
    hasDuplicate(persona.ownsManifests) ||
    persona.ownsManifests.some((value) => !supportedManifestIdentifiers.includes(value as (typeof supportedManifestIdentifiers)[number]))
  ) {
    addIssue(issues, "manifest", personaIndex);
  }
  validateCredentialName(persona.credentialName, personaIndex, issues);
}

function validateCredentialName(
  credentialName: unknown,
  personaIndex: number,
  issues: SimPersonaCatalogValidationIssue[],
): void {
  if (typeof credentialName !== "string" || !supportedCredentialNames.includes(credentialName as (typeof supportedCredentialNames)[number])) {
    addIssue(issues, "credential-name", personaIndex);
  }
}

/** Validate logical SIM personas without resolving any runtime dependency. */
export function validateSimPersonaCatalog(catalog: unknown): SimPersonaCatalogValidationResult {
  const issues: SimPersonaCatalogValidationIssue[] = [];
  const catalogKeys = isRecord(catalog) ? Object.getOwnPropertyNames(catalog) : [];
  const personaKeys = catalogKeys.filter((key) => expectedPersonaKeySet.has(key));

  if (!isRecord(catalog)) {
    addIssue(issues, "catalog-not-object");
    return { valid: false, personaCount: 0, personaKeys, issues };
  }

  const expectedKeys = expectedPersonaKeySet;
  for (const key of catalogKeys) {
    if (!/^person-[abc]$/.test(key)) addIssue(issues, "persona-key-grammar");
    if (!expectedKeys.has(key)) addIssue(issues, "persona-keys");
  }
  if (catalogKeys.length !== supportedPersonaKeys.length || supportedPersonaKeys.some((key) => !catalogKeys.includes(key))) {
    addIssue(issues, "persona-keys");
  }

  const emailLocalParts = new Set<string>();
  for (const [personaIndex, key] of personaKeys.entries()) {
    const persona = catalog[key];
    if (!isRecord(persona)) {
      addIssue(issues, "persona-not-object", personaIndex);
      continue;
    }
    validatePersonaFields(persona, personaIndex, emailLocalParts, issues);
  }

  return { valid: issues.length === 0, personaCount: personaKeys.length, personaKeys, issues };
}

export function assertValidSimPersonaCatalog(catalog: unknown): asserts catalog is SimPersonaCatalog {
  const result = validateSimPersonaCatalog(catalog);
  if (!result.valid) throw new SimPersonaCatalogValidationError(result.issues);
}

const expectedPersonaKeySet = new Set<string>(supportedPersonaKeys);
