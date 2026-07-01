// @ts-ignore
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
// @ts-ignore
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env.server";

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

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: env.S3_ENDPOINT(),
      region: env.S3_REGION(),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID(),
        secretAccessKey: env.S3_SECRET_ACCESS_KEY(),
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
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
        CacheControl: options.cacheControl,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    throw new Error(message);
  }
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

export async function createSignedObjectUrl(
  logicalBucket: ObjectStorageBucket,
  objectPath: string,
  expiresInSeconds: number,
): Promise<string> {
  const { bucketName, key } = resolveLocation(logicalBucket, objectPath);
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
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
