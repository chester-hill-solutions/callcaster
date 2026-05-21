import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const params = {
  user_id: "u1",
  caller_id: "c1",
  workspace_id: "w1",
  campaign_id: "camp1",
  selected_device: "device1",
};

describe("startConferenceAndDial", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("happy path: posts to auto-dial and returns conference data", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, conferenceName: "c1" }),
        { status: 200 },
      ),
    );

    const mod = await import("../app/lib/services/hooks-api");
    await expect(mod.startConferenceAndDial(params)).resolves.toEqual({
      success: true,
      conferenceName: "c1",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/auto-dial",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }),
    );
  });

  test("returns creditsError payload without throwing", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ creditsError: true }), { status: 200 }),
    );

    const mod = await import("../app/lib/services/hooks-api");
    await expect(mod.startConferenceAndDial(params)).resolves.toMatchObject({
      success: false,
      creditsError: true,
    });
  });

  test("throws when required params are missing", async () => {
    const mod = await import("../app/lib/services/hooks-api");
    await expect(
      mod.startConferenceAndDial({ ...params, user_id: "" }),
    ).rejects.toThrow(/Missing required parameters/);
  });

  test("throws on network and HTTP errors", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));
    const mod = await import("../app/lib/services/hooks-api");
    await expect(mod.startConferenceAndDial(params)).rejects.toThrow("network");

    vi.resetModules();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("bad", { status: 500 }),
    );
    const mod2 = await import("../app/lib/services/hooks-api");
    await expect(mod2.startConferenceAndDial(params)).rejects.toThrow(/HTTP error/);
  });
});
