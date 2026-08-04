/**
 * Thin adapter for `@chester-hill-solutions/media-library` (not yet published).
 *
 * Wraps object-storage put/get/sign helpers for media buckets so call sites can
 * swap to the CHS package by changing imports here only.
 *
 * @see docs/chs-package-adoption.md
 */
import {
  createSignedObjectUrl,
  createSignedObjectUrls,
  downloadObject,
  listObjects,
  uploadObject,
  type StoredObjectMeta,
  type UploadObjectOptions,
} from "@/lib/object-storage.server";

/** Media buckets expected by the CHS media-library package. */
export type MediaBucket = "workspaceAudio" | "messageMedia" | "audio";

export type MediaUploadOptions = UploadObjectOptions;

export type MediaObjectMeta = StoredObjectMeta;

export async function putMediaObject(
  bucket: MediaBucket,
  objectPath: string,
  body: string | Uint8Array | Buffer | Blob,
  options?: MediaUploadOptions,
): Promise<void> {
  return uploadObject(bucket, objectPath, body, options);
}

export async function getMediaObject(
  bucket: MediaBucket,
  objectPath: string,
): Promise<Buffer> {
  return downloadObject(bucket, objectPath);
}

export async function getSignedMediaUrl(
  bucket: MediaBucket,
  objectPath: string,
  expiresInSeconds: number,
): Promise<string> {
  return createSignedObjectUrl(bucket, objectPath, expiresInSeconds);
}

export async function getSignedMediaUrls(
  bucket: MediaBucket,
  objectPaths: string[],
  expiresInSeconds: number,
): Promise<Array<{ path: string; signedUrl: string | null; error: string | null }>> {
  return createSignedObjectUrls(bucket, objectPaths, expiresInSeconds);
}

export async function listMediaObjects(
  bucket: MediaBucket,
  prefixPath: string,
  options?: { sortBy?: { column: "created_at"; order: "asc" | "desc" } },
): Promise<MediaObjectMeta[]> {
  return listObjects(bucket, prefixPath, options);
}
