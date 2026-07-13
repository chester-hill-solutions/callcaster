import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const params = {
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

  test("happy path: posts to dialer/start and returns conference data", async () => {
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
      "/api/workspaces/w1/campaigns/camp1/dialer/start",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caller_id: params.caller_id,
          selected_device: params.selected_device,
        }),
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

  test("returns creditsError payload without throwing when the route responds 402", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ creditsError: true }), { status: 402 }),
    );

    const mod = await import("../app/lib/services/hooks-api");
    await expect(mod.startConferenceAndDial(params)).resolves.toMatchObject({
      success: false,
      creditsError: true,
      error: "Insufficient credits to start conference",
    });
  });

  test("throws when required params are missing", async () => {
    const mod = await import("../app/lib/services/hooks-api");
    await expect(
      mod.startConferenceAndDial({ ...params, caller_id: "" }),
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
