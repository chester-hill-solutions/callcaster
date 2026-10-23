# Inherited configuration as code and pluggable secret providers

> **Status: proposed for review (2026-10-21).** This ADR defines a staged
> migration. Existing environment loading remains supported until each consumer
> has moved and its acceptance checks pass.

## Context

CallCaster configuration is currently split between application `process.env`
reads, local `.env` files, GitHub environment secrets, Railway variables, and
Railway IaC preservation lists. `e2e/sim/config.ts` adds another independent
definition. The same environment facts can therefore drift between application,
worker, tests, deployment, and developer setup.

The project needs one non-secret configuration model that can describe inherited
environments and service access. It also needs one secret name catalog and a
safe way to change where values come from. A developer must be able to use a
local dotenv file today and a password manager later without changing runtime
code or creating a second environment definition.

## Decision

1. Create one checked-in, typed configuration tree. It is the source of truth
   for all non-secret environment settings.
2. Environments inherit from a named parent and specify only differences.
   Environment names are `local`, `sai-local`, `dev`, `qa`, and `production`.
   Production is never a parent for a non-production environment.
3. Put secret *names* and service access policy in checked-in code. Put secret
   *values* only in a selected secret provider.
4. Support a local dotenv provider and a password-manager provider behind one
   `SecretProvider` interface. The launcher selects the provider; consumers do
   not call a provider or read `process.env` directly.
5. Keep `.env` files secret-only. Do not store URLs, workspace names, role
   mappings, feature flags, or resource identifiers in `.env` files.
6. Generate and validate deployment variable mappings from this model. Railway
   IaC declares which approved keys go to each service. GitHub environment
   secrets use the same secret-name catalog. Neither is a second source of
   environment facts.
7. Migrate incrementally with compatibility adapters. Do not perform a broad
   rename or replace every environment read in one change.

The environment definitions in this ADR are the only checked-in environment
definitions for the project. They live under the shared `config/` tree and are
consumed by the app, worker, deployment IaC, scripts, and SIM runner. No
consumer may create a parallel environment directory. In particular,
`e2e/sim/` contains logical personas and task policies only; it does not define
URLs, email domains, workspace markers, secret locations, or provider flags.

## Target model

```text
config/
  schema.ts                 validated types, defaults, secret names
  base.ts                   shared non-secret defaults
  environments/
    local.ts                inherits base
    sai-local.ts            inherits local
    dev.ts                  inherits base
    qa.ts                   inherits base
    production.ts           inherits base
  services/
    app.ts                  approved config and secret keys
    worker.ts
    media-stream.ts
    sim.ts
  load.ts                   inheritance resolver and validator
  secrets/
    types.ts                SecretProvider interface
    dotenv.ts
    password-manager.ts
    github.ts               CI adapter, when needed
```

`ProjectConfig` is the validated output of `loadProjectConfig()`. A service
receives only its allowlisted slice. A service cannot request a secret that it
does not declare.

```ts
type SecretProvider = {
  get(name: SecretName): Promise<string>;
};
```

The launcher selects the provider, for example:

```bash
npm run app:dev -- --environment sai-local --secrets dotenv
npm run sim:run -- --environment dev --secrets password-manager --flow sms-send
```

The provider selection is not itself a secret. The selected provider must fail
before startup if a required secret is absent, if an unknown secret is returned,
or if it would require interactive input in CI.

## Environment inheritance rules

- `base` supplies defaults with no deployment identity or secret value.
- A child environment may override only schema-declared keys.
- The loader rejects unknown keys, circular inheritance, invalid URL/host pairs,
  and a production provider setting in a non-production environment.
- Service settings are named objects, not raw environment variables. Example:
  `telephony.providerMode`, `urls.publicApp`, and `storage.bucket`.
- The loader converts the validated service slice into the temporary process
  environment only at the process boundary. Application modules read the typed
  object, not `process.env`.
- A command records the resolved non-secret config fingerprint in diagnostics.
  It never records a secret value.

## Secret rules

- `.env.example` lists secret names and comments only.
- Ignored `.env.local` files hold local secret values only. The loader never
  creates, overwrites, or changes an existing user file.
- The password-manager provider maps the same `SecretName` values to items or
  fields. Its mapping is config-as-code; item values are not.
- CI obtains secrets from protected GitHub environment secrets through the same
  `SecretProvider` contract.
- Railway receives values through its normal protected-variable mechanism. The
  IaC model preserves only names approved by the service allowlist.
- No command prints secret values. Errors identify a secret name and provider
  only. Logs, diagnostics, SIM artifacts, and drift reports redact values.

## Incremental migration roadmap

### Phase 0 — inventory and guardrails

1. Inventory every `process.env` read, dotenv load, `.env.example` entry,
   Railway preserved variable, GitHub environment secret, and script-specific
   environment input.
2. Classify each as non-secret config, secret, generated deployment value, or
   obsolete.
3. Add a report that fails on undocumented new runtime environment reads. Start
   in report-only mode; do not change existing behavior.
4. Record current values and owners in a generated inventory. Do not print
   secret values.

**Exit:** the report accounts for every current runtime key and each key has one
classification and service owner.

### Phase 1 — schema and read-only resolved configuration

1. Add `config/schema.ts`, `config/base.ts`, and `config/load.ts`.
2. Model one low-risk non-secret slice first: public URL, runtime mode, and
   storage endpoint metadata.
3. Add local/dev/QA/production environment overlays with current values.
4. Add `config:show -- --environment <name>` to print a redacted, normalized
   resolved configuration and fingerprint.
5. Keep existing `process.env` readers unchanged. Compare their effective
   non-secret values with the new resolved config in development diagnostics.

**Exit:** every modeled value matches its current running environment, while no
production behavior has changed.

### Phase 2 — secret provider foundation

1. Define the secret-name catalog and service allowlists.
2. Add the local dotenv provider. It reads a selected ignored secret-only file
   without changing it.
3. Add `secrets:required -- --environment <name> --service <name>` to list
   required secret *names* only.
4. Add the password-manager provider and its non-interactive CI mode. Use the
   same secret names as dotenv.
5. Move one low-risk service secret through the provider with a compatibility
   fallback, then remove the fallback after its deployment verification.

**Exit:** one service starts successfully through either provider, produces no
secret output, and has the same effective secret-name contract in local and CI.

### Phase 3 — service-by-service adoption

Migrate one service boundary per atomic change: app, worker, media stream, then
scripts and browser suites. For each boundary:

1. Move its non-secret settings to the typed service slice.
2. Move its secrets to named provider lookups.
3. Keep a temporary compatibility adapter for existing variable names.
4. Compare old and new effective non-secret configuration in development and
   QA.
5. Remove the adapter only after the service deploys and its normal health and
   task checks pass.

Do not migrate billing, Twilio, database, or auth credentials together. Each is
its own atomic secret migration because a wrong mapping can interrupt traffic.

**Exit:** the service has no direct runtime `process.env` reads outside the
process-boundary adapter and has a complete allowlist.

### Phase 4 — deployment mapping and drift control

1. Replace copied Railway preserved-variable lists with generated mappings from
   service allowlists.
2. Generate the GitHub environment secret-name manifest from the same catalog.
3. Add CI checks for unknown keys, a key sent to an unapproved service, missing
   required keys, and config-schema versus Railway-IaC drift.
4. Keep Railway, GitHub, and password-manager secret *values* outside the
   repository and never compare them in CI.
5. Apply one non-production environment first, inspect the resolved fingerprint,
   then promote the mapping environment by environment.

**Exit:** dev and QA deployment mappings are generated and drift checks are
green. Production remains on the compatibility path until a separately approved
change.

### Phase 5 — SIM adoption

1. Make `e2e/sim/config.ts` a thin adapter over `ProjectConfig`,
   `ResolvedSimProfile`, and the selected `SecretProvider`.
2. Remove `SIM_SENDER_*`, recipient, workspace, and URL reads from SIM task
   code. Persona and workspace facts come from the SIM catalog; secret values
   come from the shared provider.
3. Run the existing SMS flow once through dotenv and once through the
   password-manager provider against the same non-production environment.
4. Remove the SIM compatibility variables only after both runs produce the same
   redacted configuration fingerprint and task result.

**Exit:** SIM adds no independent environment definition or secret-loading path.

### Phase 6 — remove compatibility and ratchet

1. Remove legacy direct readers service by service.
2. Change the inventory report to a CI failure for a new direct runtime read.
3. Remove obsolete `.env.example` entries and old deployment variable names
   only after their consumers have gone.
4. Keep a documented break-glass rollback: select the dotenv provider and the
   last compatible config release; do not restore deleted secret values from git.

**Exit:** the typed config tree and secret-name catalog are the only supported
runtime interface.

## Documentation changes

Update documentation as each phase reaches its exit, not in a final sweep:

| Phase | Documentation to update |
|---|---|
| 0 | `.env.example` comments; generated environment-key inventory; `docs/local-development.md` key provenance section |
| 1–2 | `docs/local-development.md` setup and provider selection; `README` command reference; secret-provider operational runbook |
| 3 | Service-specific setup docs, `docs/railway-review-env.md`, and any runbook that names a runtime variable |
| 4 | `.railway/` IaC comments, `docs/qa-rehearsal-runbook.md`, GitHub environment setup instructions, and deployment runbooks |
| 5 | `docs/sim-suite.md`, `docs/synthetic-telephony-testing.md`, Playwright/SIM command help, and agent skill guidance |
| 6 | Remove compatibility-variable references from all docs and update the generated inventory baseline |

`docs/local-development.md`, `.env.example`, `.railway/environments/*.ts`,
`docs/railway-review-env.md`, `docs/qa-rehearsal-runbook.md`,
`docs/sim-suite.md`, and `docs/synthetic-telephony-testing.md` are mandatory
review points for this migration.

## Consequences

- This is cross-cutting work and is intentionally separate from SIM task work.
- It permits local dotenv use now and password-manager use later without a
  second config model.
- The transition temporarily has compatibility code. That is safer than a
  repository-wide flag day.
- New configuration work must use the schema from Phase 1 onward. New secrets
  must use the name catalog from Phase 2 onward.

## References

- `.env.example`
- `.railway/config/shared.ts`
- `.railway/environments/dev.ts`, `qa.ts`, `production.ts`
- `e2e/sim/config.ts`
- `docs/local-development.md`
- `docs/sim-suite.md`
- `docs/synthetic-telephony-testing.md`
