import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import { LocalProfileInputSchema, type LocalProfileInput } from "./schema";

/** The only process environment keys included in the local runtime snapshot. */
export const RUNTIME_ENVIRONMENT_KEYS = [
  "DEV_NAME",
  "ENV",
  "BASE_URL",
  "NODE_ENV",
  "S3_ENDPOINT",
  "ENDPOINT",
  "AWS_ENDPOINT_URL",
  "S3_REGION",
  "REGION",
  "AWS_DEFAULT_REGION",
  "S3_BUCKET",
  "BUCKET",
  "AWS_S3_BUCKET_NAME",
  "S3_FORCE_PATH_STYLE",
  "S3_URL_STYLE",
] as const;

export type RuntimeEnvironmentKey = (typeof RUNTIME_ENVIRONMENT_KEYS)[number];
export type RuntimeEnvironmentSnapshot = Readonly<Partial<Record<RuntimeEnvironmentKey, string>>>;

export type RuntimeEnvironmentOptions = {
  cwd?: string;
  shellEnv?: Readonly<Record<string, string | undefined>>;
};

async function readDotenvFile(cwd: string, filename: string): Promise<Record<string, string>> {
  const filePath = path.join(cwd, filename);
  try {
    await access(filePath);
  } catch {
    return {};
  }
  return parse(await readFile(filePath, "utf8"));
}

function freezeSnapshot(values: Partial<Record<RuntimeEnvironmentKey, string>>): RuntimeEnvironmentSnapshot {
  return Object.freeze({ ...values });
}

/** Read the non-secret local runtime configuration without changing process.env. */
export async function readRuntimeEnvironment(options: RuntimeEnvironmentOptions = {}): Promise<RuntimeEnvironmentSnapshot> {
  const cwd = options.cwd ?? process.cwd();
  const shellEnv = options.shellEnv;
  const dotenvValues = await readDotenvFile(cwd, ".env");
  const localDotenvValues = await readDotenvFile(cwd, ".env.local");
  const snapshot: Partial<Record<RuntimeEnvironmentKey, string>> = {};

  for (const key of RUNTIME_ENVIRONMENT_KEYS) {
    const shellValue = shellEnv === undefined ? process.env[key] : shellEnv[key];
    const value = shellValue ?? localDotenvValues[key] ?? dotenvValues[key];
    if (value !== undefined) snapshot[key] = value;
  }

  return freezeSnapshot(snapshot);
}

/** Convert a snapshot into the safe input accepted by resolveLocalProjectConfig. */
export function runtimeEnvironmentToLocalProfile(snapshot: RuntimeEnvironmentSnapshot): LocalProfileInput {
  const devName = snapshot.DEV_NAME;
  const envName = snapshot.ENV;
  if (!devName || !envName) throw new Error("DEV_NAME and ENV are required for a local profile");

  let result;
  try {
    result = LocalProfileInputSchema.safeParse({
      devName,
      envName,
      ...(snapshot.BASE_URL !== undefined ? { publicUrl: snapshot.BASE_URL } : {}),
    });
  } catch {
    throw new Error("DEV_NAME, ENV, or BASE_URL is invalid for a local profile");
  }
  if (!result.success) throw new Error("DEV_NAME, ENV, or BASE_URL is invalid for a local profile");
  return result.data;
}
