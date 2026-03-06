import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

describe("startConferenceAndDial", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("happy path: starts conference then dials", async () => {
    (fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, conferenceName: "c1" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

    const mod = await import("../app/lib/startConferenceAndDial");
    await mod.startConferenceAndDial("u1", 1, "w1");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/power-dial",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/power-dial/dialer",
      expect.objectContaining({ method: "POST" }),
    );
    expect(console.log).toHaveBeenCalled();
  });

  test("logs errors when either step fails", async () => {
    (fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: "nope" })));
    const mod = await import("../app/lib/startConferenceAndDial");
    await mod.startConferenceAndDial("u1", 1, "w1");
    expect(console.error).toHaveBeenCalledWith("Failed to start conference:", "nope");

    vi.resetModules();
    (fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, conferenceName: "c1" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: "bad" })));
    const mod2 = await import("../app/lib/startConferenceAndDial");
    await mod2.startConferenceAndDial("u1", 1, "w1");
    expect(console.error).toHaveBeenCalledWith("Failed to dial numbers:", "bad");
  });

  test("catches thrown errors", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("network"));
    const mod = await import("../app/lib/startConferenceAndDial");
    await mod.startConferenceAndDial("u1", 1, "w1");
    expect(console.error).toHaveBeenCalledWith(
      "Error during conference setup and dialing:",
      expect.any(Error),
    );
  });
});

