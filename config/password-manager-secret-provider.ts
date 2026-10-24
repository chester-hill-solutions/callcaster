import { SecretNameSchema, type EnvironmentName, type SecretName } from "./schema";
import { validateSecretRequest, type SecretServiceName } from "./secrets";
import type { SecretProvider } from "./secret-provider";
import {
  passwordManagerVendors,
  type PasswordManagerAdapter,
  type PasswordManagerLookup,
  type PasswordManagerSecretMapping,
  type PasswordManagerVendor,
} from "./password-manager-contracts";

export type PasswordManagerAdapterRegistry = Readonly<{
  get(vendor: PasswordManagerVendor): PasswordManagerAdapter | undefined;
}>;

export class PasswordManagerSecretProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordManagerSecretProviderError";
  }
}

export class UnsupportedPasswordManagerAdapterError extends PasswordManagerSecretProviderError {
  constructor() {
    super("Password-manager adapter is unsupported");
    this.name = "UnsupportedPasswordManagerAdapterError";
  }
}

export class PasswordManagerAdapterUnconfiguredError extends PasswordManagerSecretProviderError {
  constructor() {
    super("Password-manager adapter is not configured");
    this.name = "PasswordManagerAdapterUnconfiguredError";
  }
}

export class PasswordManagerLookupError extends PasswordManagerSecretProviderError {
  constructor() {
    super("Password-manager lookup failed");
    this.name = "PasswordManagerLookupError";
  }
}

export class PasswordManagerSecretMissingError extends PasswordManagerSecretProviderError {
  constructor() {
    super("Password-manager returned no secret");
    this.name = "PasswordManagerSecretMissingError";
  }
}

export class PasswordManagerSecretEmptyError extends PasswordManagerSecretProviderError {
  constructor() {
    super("Password-manager returned an empty secret");
    this.name = "PasswordManagerSecretEmptyError";
  }
}

export class PasswordManagerSecretDeniedError extends PasswordManagerSecretProviderError {
  constructor() {
    super("Password-manager denied secret access");
    this.name = "PasswordManagerSecretDeniedError";
  }
}

export class InvalidPasswordManagerMappingError extends PasswordManagerSecretProviderError {
  constructor() {
    super("Password-manager mapping is invalid");
    this.name = "InvalidPasswordManagerMappingError";
  }
}

function freezeRegistry(adapters: readonly PasswordManagerAdapter[]): PasswordManagerAdapterRegistry {
  const entries = new Map<PasswordManagerVendor, PasswordManagerAdapter>();
  for (const adapter of adapters) {
    if (!(passwordManagerVendors as readonly string[]).includes(adapter.vendor)) {
      throw new UnsupportedPasswordManagerAdapterError();
    }
    entries.set(adapter.vendor, adapter);
  }
  return Object.freeze({
    get: (vendor: PasswordManagerVendor) => entries.get(vendor),
  });
}

export function createPasswordManagerAdapterRegistry(
  adapters: readonly PasswordManagerAdapter[] = [],
): PasswordManagerAdapterRegistry {
  return freezeRegistry(adapters);
}

export type PasswordManagerSecretProviderOptions = Readonly<{
  mappings: readonly PasswordManagerSecretMapping[];
  adapters?: PasswordManagerAdapterRegistry;
}>;

function snapshotMappings(
  environment: EnvironmentName,
  service: SecretServiceName,
  mappings: readonly PasswordManagerSecretMapping[],
): readonly PasswordManagerSecretMapping[] {
  if (!Array.isArray(mappings)) throw new InvalidPasswordManagerMappingError();

  const snapshots: PasswordManagerSecretMapping[] = [];
  for (const candidate of mappings as readonly unknown[]) {
    if (!candidate || typeof candidate !== "object") throw new InvalidPasswordManagerMappingError();
    const mapping = candidate as Partial<PasswordManagerSecretMapping>;
    const reference = mapping.reference;
    const parsedSecretName = SecretNameSchema.safeParse(mapping.secretName);
    if (mapping.environment !== environment || mapping.service !== service || !parsedSecretName.success) {
      throw new InvalidPasswordManagerMappingError();
    }
    if (!reference || typeof reference !== "object") throw new InvalidPasswordManagerMappingError();
    if (!(passwordManagerVendors as readonly string[]).includes(reference.vendor)) {
      throw new InvalidPasswordManagerMappingError();
    }
    if (typeof reference.reference !== "string" || reference.reference.trim().length === 0) {
      throw new InvalidPasswordManagerMappingError();
    }

    try {
      validateSecretRequest({ environment, service, names: [parsedSecretName.data] });
    } catch {
      throw new InvalidPasswordManagerMappingError();
    }

    snapshots.push(
      Object.freeze({
        environment,
        service,
        secretName: parsedSecretName.data,
        reference: Object.freeze({ vendor: reference.vendor, reference: reference.reference }),
      }),
    );
  }
  return Object.freeze(snapshots);
}

/** Resolve one approved secret through an injected, non-interactive adapter. */
export class PasswordManagerSecretProvider implements SecretProvider {
  readonly name = "password-manager";
  readonly environment: EnvironmentName;
  readonly service: SecretServiceName;
  private readonly mappings: readonly PasswordManagerSecretMapping[];
  private readonly adapters: PasswordManagerAdapterRegistry;

  constructor(environment: EnvironmentName, service: SecretServiceName, options: PasswordManagerSecretProviderOptions) {
    this.environment = environment;
    this.service = service;
    this.mappings = snapshotMappings(environment, service, options.mappings);
    this.adapters = options.adapters ?? createPasswordManagerAdapterRegistry();
  }

  async get(name: SecretName): Promise<string> {
    validateSecretRequest({ environment: this.environment, service: this.service, names: [name] });

    const mapping = this.mappings.find(
      (candidate) =>
        candidate.environment === this.environment && candidate.service === this.service && candidate.secretName === name,
    );
    if (!mapping) throw new PasswordManagerSecretDeniedError();

    if (!(passwordManagerVendors as readonly string[]).includes(mapping.reference.vendor)) {
      throw new UnsupportedPasswordManagerAdapterError();
    }
    const adapter = this.adapters.get(mapping.reference.vendor);
    if (!adapter) throw new PasswordManagerAdapterUnconfiguredError();

    const request: PasswordManagerLookup = Object.freeze({ secretName: name, reference: mapping.reference.reference });
    let result;
    try {
      result = await adapter.lookup(request);
    } catch {
      throw new PasswordManagerLookupError();
    }

    if (!result || typeof result !== "object" || !("kind" in result)) throw new PasswordManagerLookupError();
    if (result.kind === "denied") throw new PasswordManagerSecretDeniedError();
    if (result.kind === "missing") throw new PasswordManagerSecretMissingError();
    if (result.kind !== "value") throw new PasswordManagerLookupError();
    if (typeof result.value !== "string") throw new PasswordManagerLookupError();
    if (result.value.length === 0) throw new PasswordManagerSecretEmptyError();
    return result.value;
  }
}

export function createPasswordManagerSecretProvider(
  environment: EnvironmentName,
  service: SecretServiceName,
  options: PasswordManagerSecretProviderOptions,
): SecretProvider {
  return new PasswordManagerSecretProvider(environment, service, options);
}
