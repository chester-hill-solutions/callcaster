import { secretNames } from "./secret-names";
import type { EnvironmentName, SecretName } from "./schema";

export const secretServiceNames = ["app", "worker", "media-stream", "sim"] as const;
export type SecretServiceName = (typeof secretServiceNames)[number];

type SecretPolicy = Readonly<{
  allowed: readonly SecretName[];
  required: readonly SecretName[];
  optional: readonly SecretName[];
  /** Each group is a complete alternative; one group must be present. */
  requiredAlternatives: readonly (readonly SecretName[])[];
}>;

export type SecretPlan = SecretPolicy;

const asSecretNames = (names: readonly string[]): readonly SecretName[] => names as readonly SecretName[];

const objectStorageCredentialAlternatives = [
  ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
  ["ACCESS_KEY_ID", "SECRET_ACCESS_KEY"],
  ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
] as const;

const commonApplicationRequired = [
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "TWILIO_AUTH_TOKEN",
] as const;
const productionApplicationRequired = ["MEDIA_STREAM_SECRET"] as const;
const nonProductionApplicationOptional = ["MEDIA_STREAM_SECRET"] as const;
const applicationOptional = [
  "COHERE_API_KEY",
  "CRON_SECRET",
  "DATABASE_DIRECT_URL",
  "ELEVENLABS_API_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_EVENTS_SINK_SECRET",
] as const;
const productionApplicationOptional = ["OPENAI_API_KEY"] as const;
const workerOptional = ["STRIPE_WEBHOOK_SECRET"] as const;
const mediaStreamOptional = ["COHERE_API_KEY", "ELEVENLABS_API_KEY"] as const;

function asSecretNameGroups(groups: readonly (readonly string[])[]): readonly (readonly SecretName[])[] {
  return Object.freeze(groups.map((group) => Object.freeze(asSecretNames(group))));
}

function makePolicy(
  required: readonly string[],
  optional: readonly string[],
  requiredAlternatives: readonly (readonly string[])[] = [],
): SecretPolicy {
  const alternativeNames = requiredAlternatives.flat();
  return Object.freeze({
    allowed: Object.freeze(asSecretNames([...required, ...optional, ...alternativeNames])),
    required: Object.freeze(asSecretNames(required)),
    optional: Object.freeze(asSecretNames(optional)),
    requiredAlternatives: asSecretNameGroups(requiredAlternatives),
  });
}

const emptyPolicy = makePolicy([], []);

function applicationPolicy(environment: EnvironmentName): SecretPolicy {
  return makePolicy(
    [...commonApplicationRequired, ...(environment === "production" ? productionApplicationRequired : [])],
    [
      ...applicationOptional,
      ...(environment === "production" ? productionApplicationOptional : nonProductionApplicationOptional),
    ],
    objectStorageCredentialAlternatives,
  );
}

function workerPolicy(): SecretPolicy {
  return makePolicy(commonApplicationRequired, workerOptional, objectStorageCredentialAlternatives);
}

const environmentPolicies: Readonly<Record<EnvironmentName, Readonly<Record<SecretServiceName, SecretPolicy>>>> =
  Object.freeze({
    local: Object.freeze({
      app: applicationPolicy("local"),
      worker: workerPolicy(),
      "media-stream": makePolicy([], mediaStreamOptional),
      sim: emptyPolicy,
    }),
    dev: Object.freeze({
      app: applicationPolicy("dev"),
      worker: workerPolicy(),
      "media-stream": makePolicy([], mediaStreamOptional),
      sim: emptyPolicy,
    }),
    qa: Object.freeze({
      app: applicationPolicy("qa"),
      worker: workerPolicy(),
      "media-stream": makePolicy([], mediaStreamOptional),
      sim: emptyPolicy,
    }),
    production: Object.freeze({
      app: applicationPolicy("production"),
      worker: workerPolicy(),
      "media-stream": makePolicy([], mediaStreamOptional),
      sim: emptyPolicy,
    }),
  });

/** Name-only metadata. Values and provider mappings do not belong in this catalog. */
export const secretCatalog: Readonly<Record<SecretName, Readonly<{ services: readonly SecretServiceName[] }>>> = Object.freeze(
  Object.fromEntries(
    secretNames.map((name) => [
      name,
      Object.freeze({
        services: Object.freeze(
          secretServiceNames.filter((service) =>
            Object.values(environmentPolicies).some((policies) => policies[service].allowed.includes(name as SecretName)),
          ),
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
    throw new SecretAccessPolicyError("Secret name is not declared");
  }

  const denied = requested.find((name) => !plan.allowed.includes(name as SecretName));
  if (denied) {
    throw new SecretAccessPolicyError(`Secret '${denied}' is not allowlisted for service '${request.service}'`);
  }

  return Object.freeze(requested as SecretName[]);
}
