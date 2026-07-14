import { describe, expect, test } from "vitest";
import {
  hasObjectStorageEnv,
  objectStorageUsesPathStyle,
  resolveObjectStorageEnv,
  resolveObjectStorageEnvRequired,
  validateObjectStorageEnv,
} from "../app/lib/object-storage-config.server";

describe("object-storage-config.server", () => {
  test("resolveObjectStorageEnv prefers S3_* then Railway bucket vars", () => {
    expect(
      resolveObjectStorageEnv("endpoint", {
        S3_ENDPOINT: "http://127.0.0.1:9000",
        ENDPOINT: "https://storage.railway.app",
      }),
    ).toBe("http://127.0.0.1:9000");

    expect(
      resolveObjectStorageEnv("bucket", {
        ENDPOINT: "https://storage.railway.app",
        BUCKET: "callcaster-abc123",
      }),
    ).toBe("callcaster-abc123");
  });

  test("hasObjectStorageEnv accepts S3_* or Railway bucket credential sets", () => {
    expect(
      hasObjectStorageEnv({
        S3_ENDPOINT: "http://127.0.0.1:9000",
        S3_REGION: "us-east-1",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_BUCKET: "callcaster",
      }),
    ).toBe(true);

    expect(
      hasObjectStorageEnv({
        ENDPOINT: "https://storage.railway.app",
        REGION: "auto",
        ACCESS_KEY_ID: "key",
        SECRET_ACCESS_KEY: "secret",
        BUCKET: "callcaster-abc123",
      }),
    ).toBe(true);

    expect(
      hasObjectStorageEnv({
        ENDPOINT: "https://storage.railway.app",
        REGION: "auto",
        ACCESS_KEY_ID: "key",
      }),
    ).toBe(false);
  });

  test("validateObjectStorageEnv throws when no credential group is complete", () => {
    expect(() => validateObjectStorageEnv({})).toThrow(
      /Missing object storage environment variables/,
    );
  });

  test("resolveObjectStorageEnvRequired throws with guidance when unset", () => {
    expect(() => resolveObjectStorageEnvRequired("endpoint", {})).toThrow(
      /Railway bucket variables/,
    );
  });

  test("objectStorageUsesPathStyle detects MinIO vs Railway endpoints", () => {
    expect(objectStorageUsesPathStyle("http://127.0.0.1:9000")).toBe(true);
    expect(
      objectStorageUsesPathStyle("https://storage.railway.app"),
    ).toBe(false);
    expect(
      objectStorageUsesPathStyle("https://t3.storageapi.dev"),
    ).toBe(false);
  });

  test("objectStorageUsesPathStyle honors explicit overrides", () => {
    expect(
      objectStorageUsesPathStyle("https://storage.railway.app", {
        S3_FORCE_PATH_STYLE: "true",
      }),
    ).toBe(true);

    expect(
      objectStorageUsesPathStyle("http://127.0.0.1:9000", {
        S3_URL_STYLE: "virtual-hosted",
      }),
    ).toBe(false);
  });
});
