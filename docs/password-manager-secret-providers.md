# Password-manager secret providers

Phase 2 defines a provider contract. It does not ship vendor SDKs, credentials,
CLI calls, or live external lookups.

## Supported contracts

| Vendor | Checked-in reference | Authentication |
| --- | --- | --- |
| Bitwarden | Item identifier and field name | Injected non-interactive adapter |
| HashiCorp Vault | Mount, secret path, and field name | Injected non-interactive adapter |
| AWS Secrets Manager | Secret identifier and optional JSON field | Injected non-interactive adapter |
| Doppler | Project, config, and secret name | Injected non-interactive adapter |

Mappings contain only an approved `SecretName` and a stable vendor reference.
They contain no secret values. Values must stay outside the repository, logs,
diagnostics, and errors. A configured adapter must already have a
non-interactive authentication method. The built-in contracts fail safely when
no adapter is supplied; they never run a vendor CLI or open a prompt.

## Adding an adapter

1. Add an adapter implementing `PasswordManagerAdapter`.
2. Accept only the declared secret name and stable reference in `lookup`.
3. Authenticate outside this provider and return a typed result.
4. Add name-only mappings and tests for denial, empty values, failures, and
   redaction.

Do not add an enumerate or dump-all operation. Do not claim a live integration
until an adapter is implemented and separately configured.
