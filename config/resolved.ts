import { createHash } from "node:crypto";
import { environmentConfigs, loadProjectConfig } from "./load";
import type { EnvironmentName, ProjectConfig } from "./schema";

export const PROJECT_CONFIG_SCHEMA_VERSION = 1;

type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };

function sortValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}

export function stableJson(value: JsonValue): string {
  return JSON.stringify(sortValue(value));
}

function modeledService(service: ProjectConfig["services"]["app"]): JsonValue {
  return {
    enabled: service.enabled,
    ...(service.url === undefined ? {} : { url: service.url }),
    ...(service.host === undefined ? {} : { host: service.host }),
    ...(service.port === undefined ? {} : { port: service.port }),
    ...(service.bucket === undefined ? {} : { bucket: service.bucket }),
    ...(service.region === undefined ? {} : { region: service.region }),
    secrets: [...service.secrets].map(({ name }) => name).sort(),
  };
}

/** Select only the checked-in, non-secret config model and secret names. */
export function redactResolvedConfig(config: ProjectConfig): JsonValue {
  return {
    secretProvider: config.secretProvider,
    runtime: { mode: config.runtime.mode },
    urls: { ...(config.urls.publicApp === undefined ? {} : { publicApp: config.urls.publicApp }) },
    storage: {
      ...(config.storage.endpoint === undefined ? {} : { endpoint: config.storage.endpoint }),
      ...(config.storage.host === undefined ? {} : { host: config.storage.host }),
      ...(config.storage.bucket === undefined ? {} : { bucket: config.storage.bucket }),
      ...(config.storage.region === undefined ? {} : { region: config.storage.region }),
    },
    services: {
      app: modeledService(config.services.app),
      worker: modeledService(config.services.worker),
      "media-stream": modeledService(config.services["media-stream"]),
      sim: modeledService(config.services.sim),
    },
  };
}

function inheritance(environment: EnvironmentName): { parent?: EnvironmentName; chain: EnvironmentName[] } {
  const chain: EnvironmentName[] = [];
  let current: EnvironmentName | undefined = environment;
  while (current) {
    chain.unshift(current);
    current = (environmentConfigs[current] as { parent?: EnvironmentName }).parent;
  }
  const parent = chain.length > 1 ? chain[chain.length - 2] : undefined;
  return parent === undefined ? { chain } : { parent, chain };
}

export function loadResolvedConfig(environment: EnvironmentName) {
  const config = loadProjectConfig(environment);
  const reportWithoutFingerprint = {
    environment,
    inheritance: inheritance(environment),
    schemaVersion: PROJECT_CONFIG_SCHEMA_VERSION,
    config: redactResolvedConfig(config),
  } satisfies JsonValue;
  const fingerprint = createHash("sha256").update(stableJson(reportWithoutFingerprint)).digest("hex");
  return { ...reportWithoutFingerprint, fingerprint };
}
