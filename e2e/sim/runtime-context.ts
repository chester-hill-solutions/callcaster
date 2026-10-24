import { DotenvSecretProvider, type DotenvSecretProviderOptions } from "../../config/dotenv-secret-provider";
import { loadProjectConfig, resolveLocalProjectConfig } from "../../config/load";
import { readRuntimeEnvironment, runtimeEnvironmentToLocalProfile, type RuntimeEnvironmentSnapshot } from "../../config/runtime-environment";
import type { SecretProvider } from "../../config/secret-provider";
import type { EnvironmentName, LocalProfileIdentity, ProjectConfig, SecretName, SecretProviderName } from "../../config/schema";
import { resolveSimProfile, type ResolvedSimProfile } from "./personas";
import type { SimCredentialName } from "./personas/types";

export type SimRuntimeContext = Readonly<{
  profile: ResolvedSimProfile;
  providerName: SecretProviderName;
  getCredential: (name?: SimCredentialName) => Promise<string>;
}>;

export async function resolveSimRuntimeProfile(options: CreateSimRuntimeContextOptions): Promise<ResolvedSimProfile> {
  const effectiveOptions = options.environment === "local" || options.environment === undefined
    ? {
        ...options,
        runtimeEnvironment: options.runtimeEnvironment ?? (await readRuntimeEnvironment()),
      }
    : options;
  const { config, localIdentity } = resolveConfig(effectiveOptions);

  if (config.environment === "production") {
    throw new SimRuntimeContextError("SIM runtime context is not allowed for production");
  }

  return resolveSimProfile({
    personaKey: options.personaKey,
    config,
    ...(localIdentity === undefined ? {} : { localIdentity }),
  });
}

export type SimSecretProviderFactory = (input: Readonly<{
  config: ProjectConfig;
  environment: EnvironmentName;
  providerName: SecretProviderName;
}>) => SecretProvider;

export type CreateSimRuntimeContextOptions = Readonly<{
  personaKey: string;
  environment?: EnvironmentName;
  runtimeEnvironment?: RuntimeEnvironmentSnapshot;
  dotenv?: DotenvSecretProviderOptions;
  secretProviderFactory?: SimSecretProviderFactory;
}>;

export class SimRuntimeContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimRuntimeContextError";
  }
}

function defaultSecretProviderFactory(
  options: CreateSimRuntimeContextOptions,
): SimSecretProviderFactory {
  return ({ environment, providerName }) => {
    if (providerName !== "dotenv") {
      throw new SimRuntimeContextError(`SIM provider '${providerName}' is not available at this boundary`);
    }
    return new DotenvSecretProvider(environment, "sim", options.dotenv);
  };
}

function resolveConfig(options: CreateSimRuntimeContextOptions): { config: ProjectConfig; localIdentity?: LocalProfileIdentity } {
  if (options.environment !== undefined && options.environment !== "local") {
    return { config: loadProjectConfig(options.environment) };
  }

  const snapshot = options.runtimeEnvironment;
  const localInput = runtimeEnvironmentToLocalProfile(snapshot ?? {});
  const resolved = resolveLocalProjectConfig(localInput);
  return { config: resolved.config, localIdentity: resolved.identity };
}

/**
 * Build the SIM service boundary without exposing provider state or secret
 * values. The provider is created only after profile resolution and the
 * production refusal check.
 */
export async function createSimRuntimeContext(options: CreateSimRuntimeContextOptions): Promise<SimRuntimeContext> {
  const profile = await resolveSimRuntimeProfile(options);
  const effectiveOptions = options.environment === "local" || options.environment === undefined
    ? { ...options, runtimeEnvironment: options.runtimeEnvironment ?? (await readRuntimeEnvironment()) }
    : options;
  const { config } = resolveConfig(effectiveOptions);
  const providerName = profile.selectedProviderName;
  const factory = options.secretProviderFactory ?? defaultSecretProviderFactory(options);
  const provider = factory({ config, environment: profile.environment, providerName });
  const credentialName = profile.credentialName;

  const getCredential = async (requestedName = credentialName): Promise<string> => {
    if (requestedName !== credentialName) {
      throw new SimRuntimeContextError(
        `SIM credential request is not allowed; use '${credentialName}' for provider '${providerName}'`,
      );
    }

    try {
      return await provider.get(credentialName as SecretName);
    } catch {
      throw new SimRuntimeContextError(
        `SIM credential '${credentialName}' is unavailable from provider '${providerName}'`,
      );
    }
  };

  return Object.freeze({ profile, providerName, getCredential });
}
