import {
  defaultSecretProvider,
  environmentNames,
  environmentProviderCompatibility,
  secretProviderNames,
  type EnvironmentName,
  type SecretName,
  type SecretProviderName,
} from "./schema";
import { resolveSecretPlan, secretServiceNames, type SecretServiceName } from "./secrets";

export type SecretsRequiredInput = Readonly<{
  environment: EnvironmentName;
  service: SecretServiceName;
  provider?: SecretProviderName;
}>;

/** A value-free plan. This command never retrieves or returns secret values. */
export type SecretsRequiredPlan = Readonly<{
  environment: EnvironmentName;
  service: SecretServiceName;
  provider: SecretProviderName;
  required: readonly SecretName[];
  optional: readonly SecretName[];
  requiredAlternatives: readonly (readonly SecretName[])[];
}>;

const sorted = (names: readonly SecretName[]): SecretName[] => [...names].sort();

export function planRequiredSecrets(input: SecretsRequiredInput): SecretsRequiredPlan {
  const provider = input.provider ?? defaultSecretProvider(input.environment);
  if (!environmentProviderCompatibility[input.environment].includes(provider)) {
    if (provider === "github") {
      throw new Error("provider 'github' is CI-only and cannot be used by this command");
    }
    throw new Error(`provider '${provider}' is not valid for ${input.environment}`);
  }

  const plan = resolveSecretPlan(input.environment, input.service);
  return {
    environment: input.environment,
    service: input.service,
    provider,
    required: sorted(plan.required),
    optional: sorted(plan.optional),
    requiredAlternatives: plan.requiredAlternatives
      .map((group) => sorted(group))
      .sort((left, right) => left.join("\0").localeCompare(right.join("\0"))),
  };
}

export const secretsRequiredEnvironmentNames = environmentNames;
export const secretsRequiredProviderNames = secretProviderNames;
export const secretsRequiredServiceNames = secretServiceNames;
