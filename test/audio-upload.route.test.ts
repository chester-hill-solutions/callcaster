import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  requireDualAuth: vi.fn(),
  getDualAuthUser: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  uploadWorkspaceAudioApi: vi.fn(),
}));

vi.mock("@/lib/api-auth.server", () => ({
  requireDualAuth: (...args: unknown[]) => mocks.requireDualAuth(...args),
  getDualAuthUser: (auth: unknown) => mocks.getDualAuthUser(auth),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/platform-media.server", () => ({
  uploadWorkspaceAudioApi: (...args: unknown[]) =>
    mocks.uploadWorkspaceAudioApi(...args),
}));

function sessionAuth() {
  const auth = { authType: "session" as const, user: { id: "u1" } };
  mocks.requireDualAuth.mockResolvedValue(auth);
  mocks.getDualAuthUser.mockReturnValue(auth.user);
  mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
  return auth;
}

function apiKeyAuth() {
  const auth = {
    authType: "api_key" as const,
    workspaceId: "w-key",
    keyId: "k1",
    scopes: [],
  };
  mocks.requireDualAuth.mockResolvedValue(auth);
  mocks.getDualAuthUser.mockReturnValue(null);
  return auth;
}

function makeRequest(body: FormData) {
  return new Request("http://localhost/api/audio-upload", {
    method: "POST",
    body,
  });
}

describe("app/routes/api+/audio-upload action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireDualAuth.mockReset();
    mocks.getDualAuthUser.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.uploadWorkspaceAudioApi.mockReset();
  });

  test("rejects API-key callers with 401", async () => {
    apiKeyAuth();

    const mod = await import("../app/routes/api+/audio-upload.action.server");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("media", new File(["x"], "greeting.mp3", { type: "audio/mpeg" }));

    const res = await asRouteResponse(
      mod.action({ request: makeRequest(fd) } as never),
    );

    expect(res.status).toBe(401);
    expect(mocks.uploadWorkspaceAudioApi).not.toHaveBeenCalled();
  });

  test("returns 400 when workspaceId is missing", async () => {
    sessionAuth();

    const mod = await import("../app/routes/api+/audio-upload.action.server");
    const fd = new FormData();
    fd.set("media", new File(["x"], "greeting.mp3", { type: "audio/mpeg" }));

    const res = await asRouteResponse(
      mod.action({ request: makeRequest(fd) } as never),
    );

    expect(res.status).toBe(400);
    expect(mocks.requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.uploadWorkspaceAudioApi).not.toHaveBeenCalled();
  });

  test("returns 400 when media file is missing", async () => {
    sessionAuth();

    const mod = await import("../app/routes/api+/audio-upload.action.server");
    const fd = new FormData();
    fd.set("workspaceId", "w1");

    const res = await asRouteResponse(
      mod.action({ request: makeRequest(fd) } as never),
    );

    expect(res.status).toBe(400);
    expect(mocks.requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.uploadWorkspaceAudioApi).not.toHaveBeenCalled();
  });

  test("uploads and returns the normalized media name", async () => {
    sessionAuth();
    mocks.uploadWorkspaceAudioApi.mockResolvedValueOnce({
      ok: true as const,
      audio: { name: "greeting.mp3", path: "w1/greeting.mp3", signed_url: "s" },
    });

    const mod = await import("../app/routes/api+/audio-upload.action.server");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("media-name", " Greeting ");
    fd.set("media", new File(["x"], "greeting.m4a", { type: "audio/mp4" }));

    const res = await asRouteResponse(
      mod.action({ request: makeRequest(fd) } as never),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "greeting.mp3" });
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith({
      user: { id: "u1" },
      workspaceId: "w1",
    });
    expect(mocks.uploadWorkspaceAudioApi).toHaveBeenCalledWith(
      "u1",
      "w1",
      " Greeting ",
      expect.any(File),
    );
  });

  test("falls back to the file name when media-name is blank", async () => {
    sessionAuth();
    mocks.uploadWorkspaceAudioApi.mockResolvedValueOnce({
      ok: true as const,
      audio: { name: "clip.mp3", path: "w1/clip.mp3", signed_url: "s" },
    });

    const mod = await import("../app/routes/api+/audio-upload.action.server");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("media-name", "   ");
    fd.set("media", new File(["x"], "clip.wav", { type: "audio/wav" }));

    await asRouteResponse(mod.action({ request: makeRequest(fd) } as never));

    expect(mocks.uploadWorkspaceAudioApi).toHaveBeenCalledWith(
      "u1",
      "w1",
      "clip.wav",
      expect.any(File),
    );
  });

  test("propagates upload failures with their status", async () => {
    sessionAuth();
    mocks.uploadWorkspaceAudioApi.mockResolvedValueOnce({
      ok: false as const,
      error:
        "An audio file with that name already exists. Choose a different name.",
      status: 409,
    });

    const mod = await import("../app/routes/api+/audio-upload.action.server");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("media", new File(["x"], "dupe.mp3", { type: "audio/mpeg" }));

    const res = await asRouteResponse(
      mod.action({ request: makeRequest(fd) } as never),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists/i);
  });
});
