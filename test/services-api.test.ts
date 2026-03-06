import { beforeEach, describe, expect, test, vi } from "vitest";

type ServiceMod = {
  hangupCall: (params: { callSid: string; workspaceId: string }) => Promise<{ success: boolean; message?: string }>;
  startConferenceAndDial: (params: {
    user_id: string;
    caller_id: string;
    workspace_id: string;
    campaign_id: string;
    selected_device: string;
  }) => Promise<any>;
};

const services: Array<{ name: string; path: string }> = [
  { name: "api", path: "@/lib/services/api" },
  { name: "hooks-api", path: "@/lib/services/hooks-api" },
];

describe.each(services)("$name service", ({ path }) => {
  let mod: ServiceMod;

  beforeEach(async () => {
    mod = (await import(path)) as unknown as ServiceMod;
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  test("hangupCall validates required params", async () => {
    await expect(mod.hangupCall({ callSid: "", workspaceId: "w" })).rejects.toThrow("Call SID is required");
    await expect(mod.hangupCall({ callSid: "CA1", workspaceId: "" })).rejects.toThrow("Workspace ID is required");
  });

  test("hangupCall returns JSON on ok response", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: "ok" }),
    });
    await expect(mod.hangupCall({ callSid: "CA1", workspaceId: "w1" })).resolves.toEqual({
      success: true,
      message: "ok",
    });
  });

  test("hangupCall throws message from error JSON when not ok", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "bad" }),
    });
    await expect(mod.hangupCall({ callSid: "CA1", workspaceId: "w1" })).rejects.toThrow("bad");
  });

  test("hangupCall uses default message when error JSON has no message", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    await expect(mod.hangupCall({ callSid: "CA1", workspaceId: "w1" })).rejects.toThrow("Network response was not ok");
  });

  test("hangupCall uses default message when error JSON cannot be parsed", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error("no json");
      },
    });
    await expect(mod.hangupCall({ callSid: "CA1", workspaceId: "w1" })).rejects.toThrow("Network response was not ok");
  });

  test("hangupCall wraps non-Error throws", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce("nope");
    await expect(mod.hangupCall({ callSid: "CA1", workspaceId: "w1" })).rejects.toThrow(
      "An unexpected error occurred while hanging up the call",
    );
  });

  test("startConferenceAndDial validates required params list", async () => {
    await expect(
      mod.startConferenceAndDial({
        user_id: "",
        caller_id: "",
        workspace_id: "",
        campaign_id: "",
        selected_device: "",
      }),
    ).rejects.toThrow("Missing required parameters");
  });

  test("startConferenceAndDial throws on non-ok response with text", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "err",
    });
    await expect(
      mod.startConferenceAndDial({
        user_id: "u",
        caller_id: "c",
        workspace_id: "w",
        campaign_id: "cmp",
        selected_device: "dev",
      }),
    ).rejects.toThrow("HTTP error! status: 500, message: err");
  });

  test("startConferenceAndDial returns creditsError structure when present", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ creditsError: true }),
    });
    await expect(
      mod.startConferenceAndDial({
        user_id: "u",
        caller_id: "c",
        workspace_id: "w",
        campaign_id: "cmp",
        selected_device: "dev",
      }),
    ).resolves.toEqual({
      success: false,
      creditsError: true,
      error: "Insufficient credits to start conference",
    });
  });

  test("startConferenceAndDial throws when success true but no conferenceName", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    await expect(
      mod.startConferenceAndDial({
        user_id: "u",
        caller_id: "c",
        workspace_id: "w",
        campaign_id: "cmp",
        selected_device: "dev",
      }),
    ).rejects.toThrow("Conference started but no conference name returned");
  });

  test("startConferenceAndDial returns data on happy path", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, conferenceName: "conf" }),
    });
    await expect(
      mod.startConferenceAndDial({
        user_id: "u",
        caller_id: "c",
        workspace_id: "w",
        campaign_id: "cmp",
        selected_device: "dev",
      }),
    ).resolves.toEqual({ success: true, conferenceName: "conf" });
  });

  test("startConferenceAndDial wraps non-Error throws", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(123);
    await expect(
      mod.startConferenceAndDial({
        user_id: "u",
        caller_id: "c",
        workspace_id: "w",
        campaign_id: "cmp",
        selected_device: "dev",
      }),
    ).rejects.toThrow("An unexpected error occurred during conference setup");
  });
});

