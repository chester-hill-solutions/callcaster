import { describe, expect, test } from "vitest";

import { assertSafeOutboundUrl } from "../app/lib/safe-outbound-url.server";

describe("safe-outbound-url", () => {
  test("allows public https URLs", async () => {
    await expect(assertSafeOutboundUrl("https://example.com/webhook")).resolves.toHaveProperty(
      "hostname",
      "example.com",
    );
  });

  test("blocks localhost and private networks", async () => {
    await expect(assertSafeOutboundUrl("http://127.0.0.1/hook")).rejects.toThrow(
      /not allowed/i,
    );
    await expect(assertSafeOutboundUrl("http://10.0.0.5/hook")).rejects.toThrow(
      /not allowed/i,
    );
    await expect(
      assertSafeOutboundUrl("http://metadata.google.internal"),
    ).rejects.toThrow(/not allowed/i);
  });

  test("blocks non-http schemes", async () => {
    await expect(assertSafeOutboundUrl("file:///etc/passwd")).rejects.toThrow(
      /http or https/i,
    );
  });
});
