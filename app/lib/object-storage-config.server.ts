export type ObjectStorageSetting =
  | "endpoint"
  | "region"
  | "accessKeyId"
  | "secretAccessKey"
  | "bucket";

/** Env var names accepted for each object-storage setting (first match wins). */
const ENV_ALIASES: Record<ObjectStorageSetting, readonly string[]> = {
  endpoint: ["S3_ENDPOINT", "ENDPOINT", "AWS_ENDPOINT_URL"],
  region: ["S3_REGION", "REGION", "AWS_DEFAULT_REGION"],
  accessKeyId: ["S3_ACCESS_KEY_ID", "ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"],
  secretAccessKey: [
    "S3_SECRET_ACCESS_KEY",
    "SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
  ],
  bucket: ["S3_BUCKET", "BUCKET", "AWS_S3_BUCKET_NAME"],
};

const OBJECT_STORAGE_GROUPS: readonly (readonly string[])[] = [
  [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ],
  ["ENDPOINT", "REGION", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "BUCKET"],
  [
    "AWS_ENDPOINT_URL",
    "AWS_DEFAULT_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_BUCKET_NAME",
  ],
];

export function resolveObjectStorageEnv(
  setting: ObjectStorageSetting,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of ENV_ALIASES[setting]) {
    const value = env[key];
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function resolveObjectStorageEnvRequired(
  setting: ObjectStorageSetting,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = resolveObjectStorageEnv(setting, env);
  if (value) {
    return value;
  }

  throw new Error(
    `Missing object storage configuration for "${setting}". ` +
      "Set S3_* variables (local MinIO) or Railway bucket variables " +
      "(ENDPOINT, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET).",
  );
}

export function hasObjectStorageEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return OBJECT_STORAGE_GROUPS.some((group) =>
    group.every((key) => Boolean(env[key])),
  );
}

export function validateObjectStorageEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (hasObjectStorageEnv(env)) {
    return;
  }

  throw new Error(
    "Missing object storage environment variables. Provide either S3_* " +
      "(local MinIO) or Railway bucket credentials " +
      "(ENDPOINT, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET).",
  );
}

/**
 * MinIO (local dev) requires path-style URLs; Railway Buckets use virtual-hosted
 * style. Override with S3_FORCE_PATH_STYLE or S3_URL_STYLE when needed.
 */
export function objectStorageUsesPathStyle(
  endpoint: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const forcePathStyle = env.S3_FORCE_PATH_STYLE;
  if (forcePathStyle === "true" || forcePathStyle === "1") {
    return true;
  }
  if (forcePathStyle === "false" || forcePathStyle === "0") {
    return false;
  }

  const urlStyle = env.S3_URL_STYLE?.toLowerCase();
  if (urlStyle === "path" || urlStyle === "path-style") {
    return true;
  }
  if (
    urlStyle === "virtual" ||
    urlStyle === "virtual-hosted" ||
    urlStyle === "virtual-hosted-style"
  ) {
    return false;
  }

  const lower = endpoint.toLowerCase();
  if (
    lower.includes("storage.railway.app") ||
    lower.includes(".storageapi.")
  ) {
    return false;
  }

  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes(":9000")
  );
}
