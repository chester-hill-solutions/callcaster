import { describe, expect, test, vi } from "vitest";
import { attachTwilioListener } from "@/lib/twilio/call-listener-utils.client";

describe("call-listener-utils", () => {
  test("cleanup removes only the attached handler", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const off = vi.fn();
    const emitter = {
      on: vi.fn(),
      off,
    };

    const cleanupA = attachTwilioListener(emitter, "disconnect", handlerA);
    attachTwilioListener(emitter, "disconnect", handlerB);

    cleanupA();

    expect(off).toHaveBeenCalledWith("disconnect", handlerA);
    expect(off).not.toHaveBeenCalledWith("disconnect", handlerB);
  });

  test("falls back to removeAllListeners when off is unavailable", () => {
    const handler = vi.fn();
    const removeAllListeners = vi.fn();
    const emitter = {
      on: vi.fn(),
      removeAllListeners,
    };

    const cleanup = attachTwilioListener(emitter, "error", handler);
    cleanup();

    expect(removeAllListeners).toHaveBeenCalledWith("error");
  });
});
