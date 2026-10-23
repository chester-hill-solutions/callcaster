import {
  objectStorageUsesPathStyle,
  resolveObjectStorageEnv,
} from "../app/lib/object-storage-config";
import { loadProjectConfig } from "./load";
import { stableFingerprint } from "./resolved";
import type { EnvironmentName, ProjectConfig } from "./schema";

const diagnosticEnvironments = ["local", "sai-local", "dev", "qa"] as const;
type DiagnosticEnvironment = (typeof diagnosticEnvironments)[number];

export type RuntimeConfigPath =
  | "urls.publicApp"
  | "runtime.mode"
  | "storage.endpoint"
  | "storage.region"
  | "storage.bucket"
  | "storage.urlStyle";

export type RuntimeMismatchCategory = "missing" | "different" | "unexpected";

export type RuntimeConfigMismatch = {
  path: RuntimeConfigPath;
  category: RuntimeMismatchCategory;
};

export type RuntimeComparison =
  | {
      enabled: true;
      environment: DiagnosticEnvironment;
      expectedFingerprint: string;
      observedFingerprint: string;
      mismatches: RuntimeConfigMismatch[];
    }
  | {
      enabled: false;
      environment: "production";
      reason: "disabled-for-production";
    };

type RuntimeModel = {
  "urls.publicApp": string | undefined;
  "runtime.mode": string | undefined;
  "storage.endpoint": string | undefined;
  "storage.region": string | undefined;
  "storage.bucket": string | undefined;
  "storage.urlStyle": "path" | "virtual" | undefined;
};

type RuntimeModelResult = {
  values: RuntimeModel;
  modeled: Record<RuntimeConfigPath, boolean>;
};

/**
 * Comparison contract: only fields present in the typed project config are
 * compared. Optional values supplied by deployment infrastructure but not
 * modeled by an environment overlay are intentionally ignored. Modeled
 * fields keep the missing, different, and unexpected mismatch categories.
 */

function canonicalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function expectedModel(config: ProjectConfig): RuntimeModelResult {
  const endpoint = canonicalUrl(config.storage.endpoint);
  const modeled = {
    "urls.publicApp": Object.hasOwn(config.urls, "publicApp"),
    "runtime.mode": Object.hasOwn(config.runtime, "mode"),
    "storage.endpoint": Object.hasOwn(config.storage, "endpoint"),
    "storage.region": Object.hasOwn(config.storage, "region"),
    "storage.bucket": Object.hasOwn(config.storage, "bucket"),
    "storage.urlStyle": Object.hasOwn(config.storage, "endpoint"),
  } satisfies Record<RuntimeConfigPath, boolean>;
  return {
    values: {
      "urls.publicApp": canonicalUrl(config.urls.publicApp),
      "runtime.mode": config.runtime.mode,
      "storage.endpoint": endpoint,
      "storage.region": config.storage.region,
      "storage.bucket": config.storage.bucket,
      "storage.urlStyle": endpoint
        ? objectStorageUsesPathStyle(endpoint, {})
          ? "path"
          : "virtual"
        : undefined,
    },
    modeled,
  };
}

function observedModel(env: NodeJS.ProcessEnv): RuntimeModel {
  const endpoint = canonicalUrl(resolveObjectStorageEnv("endpoint", env));
  const nodeEnv = env.NODE_ENV;
  const mode = nodeEnv === "production" ? "production" : nodeEnv === "test" ? "test" : nodeEnv === "development" ? "development" : undefined;
  return {
    "urls.publicApp": canonicalUrl(env.BASE_URL),
    "runtime.mode": mode,
    "storage.endpoint": endpoint,
    "storage.region": resolveObjectStorageEnv("region", env),
    "storage.bucket": resolveObjectStorageEnv("bucket", env),
    "storage.urlStyle": endpoint
      ? objectStorageUsesPathStyle(endpoint, env)
        ? "path"
        : "virtual"
      : undefined,
  };
}

const paths = Object.keys({
  "urls.publicApp": true,
  "runtime.mode": true,
  "storage.endpoint": true,
  "storage.region": true,
  "storage.bucket": true,
  "storage.urlStyle": true,
}) as RuntimeConfigPath[];

function mismatchCategory(expected: unknown, observed: unknown): RuntimeMismatchCategory | undefined {
  if (expected === observed) return undefined;
  if (expected === undefined) return "unexpected";
  if (observed === undefined) return "missing";
  return "different";
}

export function compareRuntimeConfig(
  environment: EnvironmentName,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeComparison {
  if (environment === "production") {
    return { enabled: false, environment, reason: "disabled-for-production" };
  }
  if (!diagnosticEnvironments.includes(environment as DiagnosticEnvironment)) {
    throw new Error(`runtime comparison is not supported for '${environment}'`);
  }

  const expected = expectedModel(loadProjectConfig(environment));
  const observed = observedModel(env);
  const mismatches = paths.flatMap((path) => {
    if (!expected.modeled[path]) return [];
    const category = mismatchCategory(expected.values[path], observed[path]);
    return category ? [{ path, category }] : [];
  });

  return {
    enabled: true,
    environment,
    expectedFingerprint: stableFingerprint(expected.values as never),
    observedFingerprint: stableFingerprint(observed as never),
    mismatches,
  };
}

export function runtimeConfigFingerprint(environment: DiagnosticEnvironment): string {
  return stableFingerprint(expectedModel(loadProjectConfig(environment)).values as never);
}
