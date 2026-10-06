import { afterEach, expect, test, vi } from "vitest";
import { VoicemailEmailProvider } from "@/lib/voicemail-email-provider.server";

afterEach(() => vi.unstubAllGlobals());

test("the actual SDK transport sends the replay key and a bounded abort signal", async () => {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    expect(new Headers(options?.headers).get("Idempotency-Key")).toBe("owned-voicemail-retry");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.signal?.aborted).toBe(false);
    return new Response(JSON.stringify({ id: "owned-email" }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  const provider = new VoicemailEmailProvider("owned-placeholder-key");
  const result = await provider.emails.send({ from: "Callcaster <info@callcaster.ca>", to: ["fixture@example.test"], subject: "Owned voicemail", text: "Owned recording" }, { idempotencyKey: "owned-voicemail-retry" });
  expect(result.data?.id).toBe("owned-email"); expect(fetch).toHaveBeenCalledTimes(1);
});

test("a stalled SDK request aborts before a delivery lease can be reused", async () => {
  vi.stubGlobal("fetch", (_url: string, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
  }));
  const started = Date.now();
  const result = await new VoicemailEmailProvider("owned-placeholder-key").emails.send({ from: "Callcaster <info@callcaster.ca>", to: ["fixture@example.test"], subject: "Owned voicemail", text: "Owned recording" }, { idempotencyKey: "owned-stalled-attempt" });
  expect(result.data).toBeNull(); expect(result.error).toBeTruthy();
  expect(Date.now() - started).toBeLessThan(30_000);
}, 15_000);
