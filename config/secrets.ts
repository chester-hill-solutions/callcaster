import { secretNames } from "./secret-names";
import type { EnvironmentName, SecretName } from "./schema";

export const secretServiceNames = ["app", "worker", "media-stream", "sim"] as const;
export type SecretServiceName = (typeof secretServiceNames)[number];

type SecretPolicy = Readonly<{
  allowed: readonly SecretName[];
  required: readonly SecretName[];
  optional: readonly SecretName[];
}>;

export type SecretPlan = SecretPolicy;

const appRequired = ["DATABASE_URL"] as const;
const appOptional = ["CRON_SECRET", "DATABASE_DIRECT_URL", "STRIPE_SECRET_KEY"] as const;
const mediaStreamOptional = ["COHERE_API_KEY", "ELEVENLABS_API_KEY"] as const;

const asSecretNames = (names: readonly string[]): readonly SecretName[] => names as readonly SecretName[];

const emptyPolicy: SecretPolicy = Object.freeze({ allowed: Object.freeze([]), required: Object.freeze([]), optional: Object.freeze([]) });

const productPolicies: Readonly<Record<SecretServiceName, SecretPolicy>> = Object.freeze({
  app: Object.freeze({
    allowed: Object.freeze(asSecretNames([...appRequired, ...appOptional])),
    required: Object.freeze(asSecretNames([...appRequired])),
    optional: Object.freeze(asSecretNames([...appOptional])),
  }),
  worker: emptyPolicy,
  "media-stream": Object.freeze({
    allowed: Object.freeze(asSecretNames([...mediaStreamOptional])),
    required: Object.freeze([]),
    optional: Object.freeze(asSecretNames([...mediaStreamOptional])),
  }),
  sim: emptyPolicy,
});

const environmentPolicies: Readonly<Record<EnvironmentName, Readonly<Record<SecretServiceName, SecretPolicy>>>> =
  Object.freeze({
    local: productPolicies,
    dev: productPolicies,
    qa: productPolicies,
    production: productPolicies,
  });

/** Name-only metadata. Values and provider mappings do not belong in this catalog. */
export const secretCatalog: Readonly<Record<SecretName, Readonly<{ services: readonly SecretServiceName[] }>>> = Object.freeze(
  Object.fromEntries(
    secretNames.map((name) => [
      name,
      Object.freeze({
        services: Object.freeze(
          secretServiceNames.filter((service) => productPolicies[service].allowed.includes(name as SecretName)),
        ),
      }),
    ]),
  ) as Record<SecretName, Readonly<{ services: readonly SecretServiceName[] }>>,
);

export function isSecretServiceName(value: unknown): value is SecretServiceName {
  return typeof value === "string" && (secretServiceNames as readonly string[]).includes(value);
}

export function resolveSecretPlan(environment: EnvironmentName, service: SecretServiceName): SecretPlan {
  return getSecretPlan(environment, service);
}

export type SecretRequest = Readonly<{
  environment: EnvironmentName;
  service: SecretServiceName;
  names: readonly string[];
}>;

export class SecretAccessPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretAccessPolicyError";
  }
}

function getSecretPlan(environment: string, service: string): SecretPlan {
  const plan = environmentPolicies[environment as EnvironmentName]?.[service as SecretServiceName];
  if (!plan) {
    throw new SecretAccessPolicyError(`Service '${service}' is not allowlisted for environment '${environment}'`);
  }
  return plan;
}

/** Validate names before any provider can be asked for a value. */
export function validateSecretRequest(request: SecretRequest): readonly SecretName[] {
  const plan = getSecretPlan(request.environment, request.service);
  const requested = [...new Set(request.names)];
  const unknown = requested.filter((name) => !(secretNames as readonly string[]).includes(name));
  if (unknown.length > 0) {
    throw new SecretAccessPolicyError(`Secret name '${unknown[0]}' is not declared`);
  }

  const denied = requested.find((name) => !plan.allowed.includes(name as SecretName));
  if (denied) {
    throw new SecretAccessPolicyError(`Secret '${denied}' is not allowlisted for service '${request.service}'`);
  }

  return Object.freeze(requested as SecretName[]);
}
