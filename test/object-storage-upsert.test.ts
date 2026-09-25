import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * `upsert: false` was accepted by the type and then dropped on the floor after
 * the Supabase→S3 migration, so callers asking not to overwrite overwrote
 * anyway. For audio that is not just a lost file: a filename is how campaigns
 * and IVR steps point at a recording, so a clobbered key changes what live
 * callers hear. These tests pin the flag to real behavior.
 *
 * The guard is an explicit existence check, not the conditional write alone.
 * `If-None-Match: "*"` is optional in the S3 spec and stow ignores it
 * outright (chester-hill-solutions/stow-s3#11), which would silently drop the
 * only protection a user-facing "that name already exists" message depends on.
 */

const send = vi.fn();

// Classes, not vi.fn(() => ...): these are all invoked with `new`, and a
// vitest spy wrapping an arrow throws "is not a constructor".
function mockS3() {
  class Command {
    input: unknown;
    kind: string;
    constructor(kind: string, input: unknown) {
      this.kind = kind;
      this.input = input;
    }
  }

  vi.doMock("@aws-sdk/client-s3", () => ({
    S3Client: class {
      send = send;
    },
    PutObjectCommand: class extends Command {
      constructor(input: unknown) {
        super("put", input);
      }
    },
    GetObjectCommand: class extends Command {
      constructor(input: unknown) {
        super("get", input);
      }
    },
    DeleteObjectCommand: class extends Command {
      constructor(input: unknown) {
        super("delete", input);
      }
    },
    ListObjectsV2Command: class extends Command {
      constructor(input: unknown) {
        super("list", input);
      }
    },
    HeadObjectCommand: class extends Command {
      constructor(input: unknown) {
        super("head", input);
      }
    },
  }));
}

type SentCommand = { kind: string; input: Record<string, unknown> };

/** Commands of one kind actually handed to the S3 client, in order. */
function sent(kind: string): SentCommand[] {
  return send.mock.calls
    .map((c) => c[0] as SentCommand)
    .filter((c) => c.kind === kind);
}

const notFound = () =>
  Object.assign(new Error("NotFound"), {
    name: "NotFound",
    $metadata: { httpStatusCode: 404 },
  });

/**
 * Default: the key is absent, so the existence check passes and the write goes
 * ahead. Mirrors a healthy store rather than assuming every call succeeds.
 */
function absentThenWrite() {
  send.mockImplementation(async (cmd: SentCommand) => {
    if (cmd.kind === "head") throw notFound();
    return {};
  });
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
    absentThenWrite();
    const mod = await import("../app/lib/object-storage.server");

    await mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a"), {
      upsert: false,
    });
    expect(sent("put")[0].input.IfNoneMatch).toBe("*");
  });

  test("omits IfNoneMatch by default so existing overwrite callers are unchanged", async () => {
    mockS3();
    absentThenWrite();
    const mod = await import("../app/lib/object-storage.server");

    await mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a"));
    expect(sent("put")[0].input.IfNoneMatch).toBeUndefined();

    await mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a"), {
      upsert: true,
    });
    expect(sent("put")[1].input.IfNoneMatch).toBeUndefined();
  });

  /**
   * The kill-check. Stow returns 200 and overwrites when a conditional PUT
   * carries `If-None-Match: "*"`, so a backend like that must still be told the
   * name is taken. Delete the existence check in uploadObject and this fails,
   * because the mocked backend below accepts the duplicate exactly as stow
   * does.
   */
  test("rejects an existing key on a backend that ignores IfNoneMatch", async () => {
    mockS3();
    // Key exists, and the conditional write is silently accepted — stow's
    // behaviour, measured in chester-hill-solutions/stow-s3#11.
    send.mockImplementation(async (cmd: SentCommand) => {
      if (cmd.kind === "head") return {};
      return {};
    });
    const mod = await import("../app/lib/object-storage.server");

    await expect(
      mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a"), {
        upsert: false,
      }),
    ).rejects.toBeInstanceOf(mod.ObjectExistsError);

    // The write must not even be attempted: the whole point is not clobbering.
    expect(sent("put")).toHaveLength(0);
  });

  test("does not existence-check when overwriting is allowed", async () => {
    mockS3();
    absentThenWrite();
    const mod = await import("../app/lib/object-storage.server");

    // The key exists, but the caller allows an overwrite, so the extra read
    // would be pure cost on the hot path.
    send.mockImplementation(async () => ({}));
    await mod.uploadObject("workspaceAudio", "w1/intro.mp3", Buffer.from("a"));
    expect(sent("head")).toHaveLength(0);
  });

  test("translates a 412 into ObjectExistsError when upsert is false", async () => {
    mockS3();
    // Absent at check time, then someone else wins the race and the write is
    // refused — the conditional header is the backstop for exactly that.
    send.mockImplementation(async (cmd: SentCommand) => {
      if (cmd.kind === "head") throw notFound();
      throw Object.assign(new Error("At least one of the pre-conditions failed"), {
        name: "PreconditionFailed",
        $metadata: { httpStatusCode: 412 },
      });
    });
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

  // #1228: Supabase Storage's cacheControl took bare seconds; S3 stores the
  // header verbatim, so "60" was an invalid Cache-Control that cached nothing.
  test("normalizes bare-seconds cacheControl to max-age", async () => {
    mockS3();
    send.mockResolvedValue({});
    const mod = await import("../app/lib/object-storage.server");
    await mod.uploadObject("workspaceAudio", "w1/a.mp3", Buffer.from("a"), {
      cacheControl: "60",
    });
    const input = sent("put")[0].input as { CacheControl?: string };
    expect(input.CacheControl).toBe("max-age=60");
  });

  test("passes through an already-valid Cache-Control directive", async () => {
    mockS3();
    send.mockResolvedValue({});
    const mod = await import("../app/lib/object-storage.server");
    await mod.uploadObject("workspaceAudio", "w1/b.mp3", Buffer.from("a"), {
      cacheControl: "max-age=3600, public",
    });
    const input = sent("put")[0].input as { CacheControl?: string };
    expect(input.CacheControl).toBe("max-age=3600, public");
  });
});
