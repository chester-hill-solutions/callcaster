import { describe, expect, test } from "vitest";

import { assertSafeOutboundUrl } from "../app/lib/safe-outbound-url.server";

describe("safe-outbound-url", () => {
  test("allows public https URLs", () => {
    expect(assertSafeOutboundUrl("https://example.com/webhook").hostname).toBe(
      "example.com",
    );
  });

  test("blocks localhost and private networks", () => {
    expect(() => assertSafeOutboundUrl("http://127.0.0.1/hook")).toThrow(
      /not allowed/i,
    );
    expect(() => assertSafeOutboundUrl("http://10.0.0.5/hook")).toThrow(
      /not allowed/i,
    );
    expect(() =>
      assertSafeOutboundUrl("http://metadata.google.internal"),
    ).toThrow(/not allowed/i);
  });

  test("blocks non-http schemes", () => {
    expect(() => assertSafeOutboundUrl("file:///etc/passwd")).toThrow(
      /http or https/i,
    );
  });
});
