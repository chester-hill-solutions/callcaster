import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * `upsert: false` was accepted by the type and then dropped on the floor after
 * the Supabase→S3 migration, so callers asking not to overwrite overwrote
 * anyway. For audio that is not just a lost file: a filename is how campaigns
 * and IVR steps point at a recording, so a clobbered key changes what live
 * callers hear. These tests pin the flag to real behavior.
 *
 * Verified against MinIO (what docker-compose.dev.yml runs): a repeat
 * conditional PUT is refused with HTTP 412 / PreconditionFailed.
 */

const send = vi.fn();

// Classes, not vi.fn(() => ...): these are all invoked with `new`, and a
// vitest spy wrapping an arrow throws "is not a constructor".
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

describe("uploadObject upsert handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    send.mockReset();
    Object.assign(process.env, ENV);
  });

  test("sends IfNoneMatch only when upsert is explicitly false", async () => {
    mockS3();
    send.mockResolvedValue({});
    const mod = await import("../app/lib/object-storage.server");

    await mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a"), {
      upsert: false,
    });
    expect(send.mock.calls[0][0].input.IfNoneMatch).toBe("*");
  });

  test("omits IfNoneMatch by default so existing overwrite callers are unchanged", async () => {
    mockS3();
    send.mockResolvedValue({});
    const mod = await import("../app/lib/object-storage.server");

    await mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a"));
    expect(send.mock.calls[0][0].input.IfNoneMatch).toBeUndefined();

    await mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a"), {
      upsert: true,
    });
    expect(send.mock.calls[1][0].input.IfNoneMatch).toBeUndefined();
  });

  test("translates a 412 into ObjectExistsError when upsert is false", async () => {
    mockS3();
    send.mockRejectedValue(
      Object.assign(new Error("At least one of the pre-conditions failed"), {
        name: "PreconditionFailed",
        $metadata: { httpStatusCode: 412 },
      }),
    );
    const mod = await import("../app/lib/object-storage.server");

    await expect(
      mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a"), {
        upsert: false,
      }),
    ).rejects.toBeInstanceOf(mod.ObjectExistsError);
  });

  test("leaves unrelated failures as plain errors", async () => {
    mockS3();
    send.mockRejectedValue(
      Object.assign(new Error("connection reset"), {
        $metadata: { httpStatusCode: 500 },
      }),
    );
    const mod = await import("../app/lib/object-storage.server");

    const failure = mod.uploadObject(
      "workspaceAudio",
      "w1/intro.mp3",
      Buffer.from("a"),
      { upsert: false },
    );
    await expect(failure).rejects.toThrow("connection reset");
    await expect(failure).rejects.not.toBeInstanceOf(mod.ObjectExistsError);
  });

  test("does not misread a 412 from a normal overwrite as ObjectExistsError", async () => {
    mockS3();
    send.mockRejectedValue(
      Object.assign(new Error("precondition"), {
        name: "PreconditionFailed",
        $metadata: { httpStatusCode: 412 },
      }),
    );
    const mod = await import("../app/lib/object-storage.server");

    // No upsert:false -> we never asked for a conditional write, so a 412 is
    // somebody else's problem and must not be relabelled.
    await expect(
      mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a")),
    ).rejects.not.toBeInstanceOf(mod.ObjectExistsError);
  });
});
