import { describe, expect, test } from "vitest";
import {
  captureException,
  initializeSentry,
} from "@/lib/sentry.server";

describe("Sentry integration", () => {
  test("is a no-op when SENTRY_DSN is absent", () => {
    expect(initializeSentry("test-service", {})).toBe(false);
    expect(() => captureException(new Error("not sent"))).not.toThrow();
  });
});
