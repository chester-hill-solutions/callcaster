import type { EnvironmentName, SecretName } from "./schema";
import type { SecretServiceName } from "./secrets";

export const passwordManagerVendors = ["bitwarden", "hashicorp-vault", "aws-secrets-manager", "doppler"] as const;
export type PasswordManagerVendor = (typeof passwordManagerVendors)[number];

/** A stable, name-only reference. It is never a secret value or a credential. */
export type PasswordManagerSecretReference = Readonly<{
  vendor: PasswordManagerVendor;
  reference: string;
}>;

/** A checked-in mapping contains names and references only. */
export type PasswordManagerSecretMapping = Readonly<{
  environment: EnvironmentName;
  service: SecretServiceName;
  secretName: SecretName;
  reference: PasswordManagerSecretReference;
}>;

export type PasswordManagerLookup = Readonly<{
  secretName: SecretName;
  reference: string;
}>;

export type PasswordManagerLookupResult =
  | Readonly<{ kind: "value"; value: string }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "missing" }>;

export interface PasswordManagerAdapter {
  readonly vendor: PasswordManagerVendor;
  lookup(request: PasswordManagerLookup): Promise<PasswordManagerLookupResult>;
}

export type PasswordManagerVendorContract = Readonly<{
  vendor: PasswordManagerVendor;
  referenceFormat: string;
  authentication: string;
}>;

/** Contracts describe adapter boundaries; they do not enable a live integration. */
export const passwordManagerVendorContracts: Readonly<Record<PasswordManagerVendor, PasswordManagerVendorContract>> =
  Object.freeze({
    bitwarden: Object.freeze({
      vendor: "bitwarden",
      referenceFormat: "item identifier plus field name, supplied as an opaque stable reference",
      authentication: "an injected non-interactive adapter must provide authenticated access",
    }),
    "hashicorp-vault": Object.freeze({
      vendor: "hashicorp-vault",
      referenceFormat: "mount and secret path plus field name, supplied as an opaque stable reference",
      authentication: "an injected non-interactive adapter must provide authenticated access",
    }),
    "aws-secrets-manager": Object.freeze({
      vendor: "aws-secrets-manager",
      referenceFormat: "secret identifier plus optional JSON field, supplied as an opaque stable reference",
      authentication: "an injected non-interactive adapter must provide authenticated access",
    }),
    doppler: Object.freeze({
      vendor: "doppler",
      referenceFormat: "project, config, and secret name, supplied as an opaque stable reference",
      authentication: "an injected non-interactive adapter must provide authenticated access",
    }),
  });

/** The repository ships no live mappings. Add name-only records when a deployment is configured. */
export const passwordManagerSecretMappings: readonly PasswordManagerSecretMapping[] = Object.freeze([]);
