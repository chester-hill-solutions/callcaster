import { describe, expect, test } from "vitest";

import {
  assertLocalTarget,
  isLocalTargetHost,
} from "../scripts/lib/local-target-guard.mjs";

describe("scripts/lib/local-target-guard", () => {
  test("accepts loopback and compose service hosts", () => {
    for (const url of [
      "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster",
      "postgresql://callcaster@localhost/callcaster",
      "postgresql://callcaster@postgres:5432/callcaster",
      "http://127.0.0.1:9000",
      "http://minio:9000",
      "http://[::1]:9000",
      "http://app.localhost:9000",
    ]) {
      expect(() => assertLocalTarget(url, "url")).not.toThrow();
    }
  });

  test("refuses hosted database URLs and S3 endpoints", () => {
    for (const url of [
      "postgresql://postgres:secret@roundhouse.proxy.rlwy.net:5432/railway",
      "postgresql://postgres:secret@postgres.railway.internal:5432/railway",
      "postgresql://user@db.example.com/prod",
      "https://s3.us-east-1.amazonaws.com",
      "https://storage.railway.app",
    ]) {
      expect(() => assertLocalTarget(url, "DATABASE_URL")).toThrow(/not the local compose stack/);
    }
  });

  test("refuses an unparseable value rather than falling through", () => {
    expect(() => assertLocalTarget("not a url", "DATABASE_URL")).toThrow(/not a parseable URL/);
    expect(() => assertLocalTarget(undefined, "DATABASE_URL")).toThrow(/not a parseable URL/);
  });

  test("does not treat a lookalike host as local", () => {
    expect(isLocalTargetHost("localhost.example.com")).toBe(false);
    expect(isLocalTargetHost("127.0.0.1.nip.io")).toBe(false);
    expect(isLocalTargetHost("postgres.railway.internal")).toBe(false);
  });
});
