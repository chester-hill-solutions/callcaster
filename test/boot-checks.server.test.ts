import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headBucket: vi.fn(async () => ({})),
  fetchAccount: vi.fn(async () => ({})),
  listConfiguredBuckets: vi.fn(() => [
    { envVar: "S3_BUCKET", bucketName: "callcaster-test" },
  ]),
}));

vi.mock("@/lib/object-storage.server", () => ({
  getS3Client: () => ({
    send: (...args: unknown[]) => mocks.headBucket(...args),
  }),
  listConfiguredBuckets: (...args: unknown[]) =>
    mocks.listConfiguredBuckets(...args),
}));

vi.mock("@/twilio.server", () => ({
  twilio: {
    api: {
      v2010: {
        accounts: (_sid: string) => ({
          fetch: (...args: unknown[]) => mocks.fetchAccount(...args),
        }),
      },
    },
  },
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    TWILIO_SID: () => "AC_test",
  },
}));

describe("runBootSmokeChecks", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.headBucket.mockReset().mockResolvedValue({});
    mocks.fetchAccount.mockReset().mockResolvedValue({});
    mocks.listConfiguredBuckets.mockReset().mockReturnValue([
      { envVar: "S3_BUCKET", bucketName: "callcaster-test" },
    ]);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
    vi.resetModules();
  });

  test("passes silently when S3 and Twilio checks succeed", async () => {
    const { runBootSmokeChecks } = await import(
      "../app/server/boot-checks.server"
    );

    await runBootSmokeChecks({});

    expect(mocks.headBucket).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAccount).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("logs a structured error naming the bucket and env var on S3 failure", async () => {
    mocks.headBucket.mockRejectedValue(new Error("connection refused"));
    const { runBootSmokeChecks } = await import(
      "../app/server/boot-checks.server"
    );

    await runBootSmokeChecks({});

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line] = errorSpy.mock.calls[0];
    const entry = JSON.parse(line as string);
    expect(entry.level).toBe("error");
    expect(entry.message).toBe(
      "S3 bucket 'callcaster-test' (S3_BUCKET) not reachable — recordings/uploads will fail on first use",
    );
    expect(entry.envVar).toBe("S3_BUCKET");
    expect(entry.bucketName).toBe("callcaster-test");
  });

  test("logs a structured error on Twilio auth failure", async () => {
    mocks.fetchAccount.mockRejectedValue(new Error("401 unauthorized"));
    const { runBootSmokeChecks } = await import(
      "../app/server/boot-checks.server"
    );

    await runBootSmokeChecks({});

    const twilioLog = errorSpy.mock.calls
      .map(([line]) => JSON.parse(line as string))
      .find((entry) => entry.message.includes("Twilio credentials invalid"));

    expect(twilioLog).toBeDefined();
    expect(twilioLog.message).toBe(
      "Twilio credentials invalid — calls/SMS will fail",
    );
  });

  test("never throws even when both checks fail", async () => {
    mocks.headBucket.mockRejectedValue(new Error("s3 down"));
    mocks.fetchAccount.mockRejectedValue(new Error("twilio down"));
    const { runBootSmokeChecks } = await import(
      "../app/server/boot-checks.server"
    );

    await expect(runBootSmokeChecks({})).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  test("skips entirely under E2E_TEST=1", async () => {
    const { runBootSmokeChecks } = await import(
      "../app/server/boot-checks.server"
    );

    await runBootSmokeChecks({ E2E_TEST: "1" });

    expect(mocks.headBucket).not.toHaveBeenCalled();
    expect(mocks.fetchAccount).not.toHaveBeenCalled();
    expect(mocks.listConfiguredBuckets).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
