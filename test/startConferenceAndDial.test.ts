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
    await expect(mod.startConferenceAndDial(params)).rejects.toThrow("Could not start dialing. Try again.");

    vi.resetModules();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("bad", { status: 500 }),
    );
    const mod2 = await import("../app/lib/services/hooks-api");
    await expect(mod2.startConferenceAndDial(params)).rejects.toThrow("Could not start dialing. Try again.");
  });
  test("a plain JSON validation error preserves the route's recovery message", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Campaign is paused." }, { status: 400 }));
    const { startConferenceAndDial } = await import("../app/lib/services/hooks-api");
    await expect(startConferenceAndDial(params)).rejects.toThrow("Campaign is paused.");
  });

  test.each([
    { status: 400, body: "<html>proxy secret</html>" },
    { status: 400, body: JSON.stringify({ error: "<script>proxy secret</script>" }) },
    { status: 400, body: JSON.stringify({ error: { secret: "trace" } }) },
    { status: 400, body: JSON.stringify({ error: "" }) },
    { status: 400, body: JSON.stringify({ error: "x".repeat(301) }) },
    { status: 400, body: JSON.stringify({ error: "provider account secret" }) },
    { status: 500, body: JSON.stringify({ error: "provider account secret" }) },
    { status: 500, body: JSON.stringify({ error: "Campaign is paused." }) },
    { status: 200, body: "not JSON" },
    { status: 200, body: "null" },
    { status: 200, body: JSON.stringify({ success: true, conferenceName: 42 }) },
  ])("unsafe or malformed response is a stable failure: $status $body", async ({ status, body }) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status }));
    const { startConferenceAndDial } = await import("../app/lib/services/hooks-api");
    await expect(startConferenceAndDial(params)).rejects.toThrow("Could not start dialing. Try again.");
  });

  test("an unsuccessful 200 with an unknown error returns only the safe retry message", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: false, error: "provider account secret" }));
    const { startConferenceAndDial } = await import("../app/lib/services/hooks-api");
    await expect(startConferenceAndDial(params)).resolves.toEqual({ success: false, error: "Could not start dialing. Try again." });
  });

  test("an unsuccessful 200 preserves a recognized recovery message", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: false, error: "Campaign is paused." }));
    const { startConferenceAndDial } = await import("../app/lib/services/hooks-api");
    await expect(startConferenceAndDial(params)).resolves.toEqual({ success: false, error: "Campaign is paused." });
  });

});
