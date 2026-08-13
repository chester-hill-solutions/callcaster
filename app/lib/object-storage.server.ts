import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env.server";
import { objectStorageUsesPathStyle } from "@/lib/object-storage-config";
import { logger } from "@/lib/logger.server";

/** Postgres-compatible logical bucket names. */
export type ObjectStorageBucket =
  | "workspaceAudio"
  | "messageMedia"
  | "audio"
  | "campaign-exports"
  | "audience-uploads";

export type StoredObjectMeta = {
  name: string;
  id: string;
  created_at: string;
  updated_at: string;
};

export type UploadObjectOptions = {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
};

type ResolvedLocation = {
  bucketName: string;
  key: string;
};

let s3Client: S3Client | undefined;

/**
 * Shared S3 client. Exported so boot-time smoke checks (see
 * app/server/boot-checks.server.ts) can reuse the same client/credentials
 * instead of constructing a duplicate one.
 */
export function getS3Client(): S3Client {
  if (!s3Client) {
    const endpoint = env.S3_ENDPOINT();
    s3Client = new S3Client({
      endpoint,
      region: env.S3_REGION(),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID(),
        secretAccessKey: env.S3_SECRET_ACCESS_KEY(),
      },
      forcePathStyle: objectStorageUsesPathStyle(endpoint),
    });
  }
  return s3Client;
}

/** Underlying S3 bucket env vars, keyed by the name used in error messages. */
const BUCKET_ENV_VARS = [
  "S3_BUCKET",
  "S3_BUCKET_AUDIO",
  "S3_BUCKET_MEDIA",
  "S3_BUCKET_EXPORTS",
] as const;

export type ConfiguredBucket = {
  envVar: (typeof BUCKET_ENV_VARS)[number];
  bucketName: string;
};

/**
 * Every underlying S3 bucket name that is actually configured (fallback
 * S3_BUCKET plus any dedicated buckets). Used by boot-time smoke checks to
 * verify each configured bucket is reachable.
 */
export function listConfiguredBuckets(): ConfiguredBucket[] {
  const resolvers: Record<(typeof BUCKET_ENV_VARS)[number], () => string | undefined> = {
    S3_BUCKET: () => env.S3_BUCKET(),
    S3_BUCKET_AUDIO: () => env.S3_BUCKET_AUDIO(),
    S3_BUCKET_MEDIA: () => env.S3_BUCKET_MEDIA(),
    S3_BUCKET_EXPORTS: () => env.S3_BUCKET_EXPORTS(),
  };

  const buckets: ConfiguredBucket[] = [];
  for (const envVar of BUCKET_ENV_VARS) {
    const bucketName = resolvers[envVar]();
    if (bucketName) {
      buckets.push({ envVar, bucketName });
    }
  }
  return buckets;
}

function dedicatedBucketFor(logicalBucket: ObjectStorageBucket): string | undefined {
  switch (logicalBucket) {
    case "workspaceAudio":
    case "audio":
      return env.S3_BUCKET_AUDIO();
    case "messageMedia":
      return env.S3_BUCKET_MEDIA();
    case "campaign-exports":
    case "audience-uploads":
      return env.S3_BUCKET_EXPORTS();
    default: {
      const _exhaustive: never = logicalBucket;
      return _exhaustive;
    }
  }
}

function resolveLocation(
  logicalBucket: ObjectStorageBucket,
  objectPath: string,
): ResolvedLocation {
  const dedicatedBucket = dedicatedBucketFor(logicalBucket);
  if (dedicatedBucket) {
    return { bucketName: dedicatedBucket, key: objectPath };
  }

  const fallbackBucket = env.S3_BUCKET();
  if (!fallbackBucket) {
    throw new Error(
      `Missing S3 bucket configuration for "${logicalBucket}". ` +
        "Set S3_BUCKET or the bucket-specific S3_BUCKET_* variables.",
    );
  }

  return {
    bucketName: fallbackBucket,
    key: `${logicalBucket}/${objectPath}`,
  };
}

function toBuffer(body: string | Uint8Array | Buffer | Blob): Promise<Buffer> {
  if (typeof body === "string") {
    return Promise.resolve(Buffer.from(body, "utf-8"));
  }
  if (Buffer.isBuffer(body)) {
    return Promise.resolve(body);
  }
  if (body instanceof Uint8Array) {
    return Promise.resolve(Buffer.from(body));
  }
  return body.arrayBuffer().then((bytes) => Buffer.from(bytes));
}

function basenameFromKey(key: string, prefix: string): string {
  if (!key.startsWith(prefix)) {
    return key.split("/").pop() ?? key;
  }
  return key.slice(prefix.length);
}

/** Thrown when `upsert: false` was requested and the key already exists. */
export class ObjectExistsError extends Error {
  constructor(objectPath: string) {
    super(`An object already exists at ${objectPath}.`);
    this.name = "ObjectExistsError";
  }
}

export async function uploadObject(
  logicalBucket: ObjectStorageBucket,
  objectPath: string,
  body: string | Uint8Array | Buffer | Blob,
  options: UploadObjectOptions = {},
): Promise<void> {
  const { bucketName, key } = resolveLocation(logicalBucket, objectPath);
  const payload = await toBuffer(body);

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: payload,
        ContentType: options.contentType,
        // Supabase Storage took bare seconds ("60") and expanded them to
        // max-age; S3 stores the header verbatim, so a bare number is an
        // invalid directive that caches nothing (#1228). Normalize here so
        // no call site can regress.
        CacheControl:
          options.cacheControl && /^\d+$/.test(options.cacheControl)
            ? `max-age=${options.cacheControl}`
            : options.cacheControl,
        // `upsert` predates the S3 migration (it was a Supabase storage flag)
        // and was silently dropped here, so callers asking not to overwrite
        // were overwriting anyway. For audio that is not just a lost file: a
        // filename is how campaigns and IVR steps point at a recording, so a
        // clobbered key changes what live callers hear. A conditional write
        // makes the flag mean what it says.
        ...(options.upsert === false ? { IfNoneMatch: "*" } : {}),
      }),
    );
  } catch (error) {
    if (options.upsert === false && isPreconditionFailed(error)) {
      throw new ObjectExistsError(objectPath);
    }
    const message = error instanceof Error ? error.message : "Upload failed";
    throw new Error(message);
  }
}

/** S3 and MinIO both answer a failed `IfNoneMatch: "*"` with HTTP 412. */
function isPreconditionFailed(error: unknown): boolean {
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate?.$metadata?.httpStatusCode === 412 ||
    candidate?.name === "PreconditionFailed"
  );
}

export async function downloadObject(
  logicalBucket: ObjectStorageBucket,
  objectPath: string,
): Promise<Buffer> {
  const { bucketName, key } = resolveLocation(logicalBucket, objectPath);
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`Object not found: ${logicalBucket}/${objectPath}`);
  }

  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(
  logicalBucket: ObjectStorageBucket,
  objectPath: string,
): Promise<void> {
  const { bucketName, key } = resolveLocation(logicalBucket, objectPath);
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
}

/** SigV4's hard ceiling for presigned URLs — the signer rejects anything longer. */
const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function createSignedObjectUrl(
  logicalBucket: ObjectStorageBucket,
  objectPath: string,
  expiresInSeconds: number,
): Promise<string> {
  // Clamp rather than let the signer throw: an over-long TTL silently killed
  // every voicemail email for months (#1224) because the failure surfaced
  // only at send time, deep inside a webhook handler.
  let expiresIn = expiresInSeconds;
  if (expiresIn > MAX_SIGNED_URL_TTL_SECONDS) {
    logger.warn("createSignedObjectUrl: TTL exceeds the SigV4 7-day cap; clamping", {
      requested: expiresInSeconds,
      objectPath,
    });
    expiresIn = MAX_SIGNED_URL_TTL_SECONDS;
  }
  const { bucketName, key } = resolveLocation(logicalBucket, objectPath);
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn },
  );
}

export async function createSignedObjectUrls(
  logicalBucket: ObjectStorageBucket,
  objectPaths: string[],
  expiresInSeconds: number,
): Promise<Array<{ path: string; signedUrl: string | null; error: string | null }>> {
  return Promise.all(
    objectPaths.map(async (objectPath) => {
      try {
        const signedUrl = await createSignedObjectUrl(
          logicalBucket,
          objectPath,
          expiresInSeconds,
        );
        return { path: objectPath, signedUrl, error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Signed URL failed";
        return { path: objectPath, signedUrl: null, error: message };
      }
    }),
  );
}

export async function listObjects(
  logicalBucket: ObjectStorageBucket,
  prefixPath: string,
  options: { sortBy?: { column: "created_at"; order: "asc" | "desc" } } = {},
): Promise<StoredObjectMeta[]> {
  const { bucketName, key: resolvedPrefix } = resolveLocation(
    logicalBucket,
    prefixPath,
  );
  const listPrefix = resolvedPrefix.endsWith("/")
    ? resolvedPrefix
    : `${resolvedPrefix}/`;

  const objects: StoredObjectMeta[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: listPrefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of response.Contents ?? []) {
      if (!item.Key || item.Key.endsWith("/")) {
        continue;
      }

      const name = basenameFromKey(item.Key, listPrefix);
      const timestamp = item.LastModified?.toISOString() ?? new Date().toISOString();
      objects.push({
        name,
        id: name,
        created_at: timestamp,
        updated_at: timestamp,
      });
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  const order = options.sortBy?.order ?? "desc";
  objects.sort((a, b) => {
    const diff =
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return order === "asc" ? diff : -diff;
  });

  return objects;
}
