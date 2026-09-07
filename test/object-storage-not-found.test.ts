import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * A missing key used to surface as the raw AWS `NoSuchKey` error, so callers
 * matching on "Object not found" (the message downloadObject only produced
 * for an empty body) answered 500 for a genuinely absent object.
 */

const send = vi.fn();

function mockS3() {
  class Command {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  vi.doMock("@aws-sdk/client-s3", () => ({
    S3Client: class {
      send = send;
    },
    PutObjectCommand: class extends Command {},
    GetObjectCommand: class extends Command {},
    DeleteObjectCommand: class extends Command {},
    ListObjectsV2Command: class extends Command {},
    HeadObjectCommand: class extends Command {},
  }));
}

const ENV = {
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
  S3_BUCKET: "callcaster",
};

describe("downloadObject not-found normalization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    send.mockReset();
    Object.assign(process.env, ENV);
  });

  test("translates S3 NoSuchKey into ObjectNotFoundError", async () => {
    mockS3();
    send.mockRejectedValue(
      Object.assign(new Error("The specified key does not exist."), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      }),
    );
    const mod = await import("../app/lib/object-storage.server");

    await expect(
      mod.downloadObject("workspaceAudio", "w1/missing.mp3"),
    ).rejects.toBeInstanceOf(mod.ObjectNotFoundError);
  });

  test("an empty body is also ObjectNotFoundError", async () => {
    mockS3();
    send.mockResolvedValue({});
    const mod = await import("../app/lib/object-storage.server");

    await expect(
      mod.downloadObject("workspaceAudio", "w1/empty.mp3"),
    ).rejects.toBeInstanceOf(mod.ObjectNotFoundError);
  });

  test("other storage failures pass through untouched", async () => {
    mockS3();
    const outage = Object.assign(new Error("connect ECONNREFUSED"), {
      name: "TimeoutError",
      $metadata: { httpStatusCode: 503 },
    });
    send.mockRejectedValue(outage);
    const mod = await import("../app/lib/object-storage.server");

    await expect(
      mod.downloadObject("workspaceAudio", "w1/x.mp3"),
    ).rejects.toBe(outage);
  });
});
