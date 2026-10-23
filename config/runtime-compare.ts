import { z } from "zod";
import {
  objectStorageUsesPathStyle,
  resolveObjectStorageEnv,
} from "../app/lib/object-storage-config";
import { loadProjectConfig, resolveLocalProjectConfig } from "./load";
import { readRuntimeEnvironment, runtimeEnvironmentToLocalProfile, RUNTIME_ENVIRONMENT_KEYS, type RuntimeEnvironmentSnapshot } from "./runtime-environment";
import { stableFingerprint } from "./resolved";
import { ConfigValidationError, parseDiagnosticUrl, type EnvironmentName, type ProjectConfig } from "./schema";

const diagnosticEnvironments = ["local", "dev", "qa"] as const;
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

export type LocalRuntimeMode = "standard" | "dev-local";

/** Apply only the non-secret local infrastructure defaults used by dev-local. */
export function applyDevLocalOverrides(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeEnvironmentSnapshot {
  const safe = Object.fromEntries(
    RUNTIME_ENVIRONMENT_KEYS.flatMap((key) => env[key] === undefined ? [] : [[key, env[key]]]),
  );
  return Object.freeze({
    ...safe,
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_REGION: "us-east-1",
    S3_BUCKET: "callcaster",
    S3_FORCE_PATH_STYLE: "true",
    ...(env.NODE_ENV === undefined ? { NODE_ENV: "development" } : {}),
    ...(env.BASE_URL === undefined ? { BASE_URL: "http://localhost:3000" } : {}),
  });
}

const paths = Object.keys({
  "urls.publicApp": true,
  "runtime.mode": true,
  "storage.endpoint": true,
  "storage.region": true,
  "storage.bucket": true,
  "storage.urlStyle": true,
}) as RuntimeConfigPath[];

/**
 * Comparison contract: only fields present in the typed project config are
 * compared. Optional values supplied by deployment infrastructure but not
 * modeled by an environment overlay are intentionally ignored. Modeled
 * fields keep the missing, different, and unexpected mismatch categories.
 */

function invalidRuntimeUrl(path: string): never {
  throw new ConfigValidationError(new z.ZodError([
    { code: "custom", path: [path], message: "must be a valid URL without credentials, query strings, or fragments" },
  ]));
}

function validateObservedRuntimeUrls(env: Readonly<Record<string, string | undefined>>): void {
  if (env.BASE_URL !== undefined && !parseDiagnosticUrl(env.BASE_URL)) invalidRuntimeUrl("BASE_URL");
  const endpoint = resolveObjectStorageEnv("endpoint", env as NodeJS.ProcessEnv);
  if (endpoint !== undefined && !parseDiagnosticUrl(endpoint)) invalidRuntimeUrl("storage.endpoint");
}

function canonicalUrl(value: string | undefined, path = "url"): string | undefined {
  if (!value) return undefined;
  const url = parseDiagnosticUrl(value);
  if (!url) invalidRuntimeUrl(path);
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function projectModeledValues(
  values: RuntimeModel,
  modeled: Record<RuntimeConfigPath, boolean>,
): Partial<RuntimeModel> {
  return Object.fromEntries(
    paths.filter((path) => modeled[path]).map((path) => [path, values[path]]),
  );
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
  const endpoint = canonicalUrl(resolveObjectStorageEnv("endpoint", env), "storage.endpoint");
  const nodeEnv = env.NODE_ENV;
  const mode = nodeEnv === "production" ? "production" : nodeEnv === "test" ? "test" : nodeEnv === "development" ? "development" : undefined;
  return {
    "urls.publicApp": canonicalUrl(env.BASE_URL, "BASE_URL"),
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

function mismatchCategory(expected: unknown, observed: unknown): RuntimeMismatchCategory | undefined {
  if (expected === observed) return undefined;
  if (expected === undefined) return "unexpected";
  if (observed === undefined) return "missing";
  return "different";
}

export async function compareRuntimeConfig(
  environment: EnvironmentName,
  env: NodeJS.ProcessEnv = process.env,
  options: { localMode?: LocalRuntimeMode; cwd?: string; snapshot?: RuntimeEnvironmentSnapshot } = {},
): Promise<RuntimeComparison> {
  if (options.localMode && options.localMode !== "standard" && environment !== "local") {
    throw new Error("--local-mode is supported only for local");
  }
  if (environment === "production") {
    return { enabled: false, environment, reason: "disabled-for-production" };
  }
  if (!diagnosticEnvironments.includes(environment as DiagnosticEnvironment)) {
    throw new Error(`runtime comparison is not supported for '${environment}'`);
  }

  const snapshot = environment === "local"
    ? options.snapshot ?? await readRuntimeEnvironment({ cwd: options.cwd, shellEnv: env })
    : undefined;
  const effectiveSnapshot = snapshot && options.localMode === "dev-local"
    ? applyDevLocalOverrides(snapshot)
    : snapshot;
  validateObservedRuntimeUrls(effectiveSnapshot ?? env);
  const localInput = effectiveSnapshot ? runtimeEnvironmentToLocalProfile(effectiveSnapshot) : undefined;
  const expected = expectedModel(localInput ? resolveLocalProjectConfig(localInput).config : loadProjectConfig(environment));
  const observedEnv = effectiveSnapshot ?? env;
  const observed = observedModel(observedEnv as NodeJS.ProcessEnv);
  if (environment === "local" && effectiveSnapshot?.NODE_ENV === undefined && options.localMode !== "dev-local") {
    observed["runtime.mode"] = "development";
  }
  const mismatches = paths.flatMap((path) => {
    if (!expected.modeled[path]) return [];
    const category = mismatchCategory(expected.values[path], observed[path]);
    return category ? [{ path, category }] : [];
  });

  return {
    enabled: true,
    environment,
    expectedFingerprint: stableFingerprint(projectModeledValues(expected.values, expected.modeled) as never),
    observedFingerprint: stableFingerprint(projectModeledValues(observed, expected.modeled) as never),
    mismatches,
  };
}

export function runtimeConfigFingerprint(environment: DiagnosticEnvironment): string {
  return stableFingerprint(expectedModel(loadProjectConfig(environment)).values as never);
}
