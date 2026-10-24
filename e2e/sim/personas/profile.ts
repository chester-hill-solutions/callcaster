import {
  safeParseProjectConfig,
  type EnvironmentName,
  type LocalProfileIdentity,
  type ProjectConfig,
} from "../../../config/schema";
import { simPersonas } from "./catalog";
import { assertValidSimPersonaCatalog } from "./validate";
import { deepFreeze, type SimPersonaCatalog, type SimPersonaKey } from "./types";

export type ResolvedSimProfile = Readonly<{
  personaKey: SimPersonaKey;
  environment: Exclude<EnvironmentName, "production">;
  runtimeIdentity: string;
  email: string;
  workspaceName: string;
  workspaceMarker: string;
  expectedRole: SimPersonaCatalog[SimPersonaKey]["role"];
  capabilities: readonly string[];
  allowedFlows: readonly string[];
  ownedManifests: readonly string[];
  selectedProviderName: ProjectConfig["secretProvider"];
  credentialName: SimPersonaCatalog[SimPersonaKey]["credentialName"];
  trafficPolicy: ProjectConfig["services"]["sim"]["trafficPolicy"];
  runtimeWorkspaceId?: string;
}>;

export type ResolveSimProfileInput = Readonly<{
  personaKey: string;
  config: unknown;
  localIdentity?: LocalProfileIdentity;
  catalog?: unknown;
}>;

export class SimProfileResolutionError extends Error {
  constructor(message: string) {
    super(`SIM profile resolution failed: ${message}`);
    this.name = "SimProfileResolutionError";
  }
}

function fail(message: string): never {
  throw new SimProfileResolutionError(message);
}

/** Resolve a checked-in persona using only injected, validated shared config. */
export function resolveSimProfile(input: ResolveSimProfileInput): ResolvedSimProfile {
  const configResult = safeParseProjectConfig(input.config);
  if (!configResult.success) fail("invalid project configuration");
  const config = configResult.data;

  if (config.environment === "production") fail("production is not allowed");

  const catalog = input.catalog ?? simPersonas;
  try {
    assertValidSimPersonaCatalog(catalog);
  } catch {
    fail("invalid persona catalog");
  }

  if (!Object.prototype.hasOwnProperty.call(catalog, input.personaKey)) {
    fail("unknown persona key");
  }
  if (!isSupportedPersonaKey(input.personaKey)) fail("unknown persona key");

  const runtimeIdentity = resolveRuntimeIdentity(config.environment, input.localIdentity);
  const persona = catalog[input.personaKey];
  const email = `${persona.emailLocalPart}@${runtimeIdentity}.${config.emailDomain}`;

  return deepFreeze({
    personaKey: input.personaKey,
    environment: config.environment,
    runtimeIdentity,
    email,
    workspaceName: persona.workspaceName,
    workspaceMarker: `sim:${runtimeIdentity}`,
    expectedRole: persona.role,
    capabilities: [...persona.capabilities],
    allowedFlows: [...persona.allowedFlows],
    ownedManifests: [...persona.ownsManifests],
    selectedProviderName: config.secretProvider,
    credentialName: persona.credentialName,
    trafficPolicy: config.services.sim.trafficPolicy,
  });
}

function resolveRuntimeIdentity(environment: Exclude<EnvironmentName, "production">, localIdentity?: LocalProfileIdentity): string {
  if (environment === "local") {
    if (!localIdentity || localIdentity.envName !== "local" || !localIdentity.profileName) {
      fail("local identity is required");
    }
    const expectedProfileName = `${localIdentity.devName}-${localIdentity.envName}`;
    if (localIdentity.profileName !== expectedProfileName) {
      fail("local identity is inconsistent");
    }
    return localIdentity.profileName;
  }
  return environment;
}

function isSupportedPersonaKey(value: string): value is SimPersonaKey {
  return value === "person-a" || value === "person-b" || value === "person-c";
}
