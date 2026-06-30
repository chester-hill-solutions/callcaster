import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  updateCampaignVoicedropAudio: vi.fn(async () => ({ id: 1 })),
}));

vi.mock("../app/lib/adminDb.server", () => ({
  verifyAuth: (...a: any[]) => mocks.verifyAuth(...a),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-ivr.server")>();
  return {
    ...actual,
    updateCampaignVoicedropAudio: (...args: unknown[]) =>
      mocks.updateCampaignVoicedropAudio(...args),
  };
});

function makeDbClient(opts?: { uploadError?: any }) {
  return {
    storage: {
      from: () => ({
        upload: async (_name: string, _buf: any, _opts: any) => ({
          data: opts?.uploadError ? null : { path: "p1" },
          error: opts?.uploadError ?? null,
        }),
        getPublicUrl: (_path: string) => ({ data: { publicUrl: "https://public" } }),
      }),
    },
  };
}

describe("app/routes/api+/media/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    mocks.updateCampaignVoicedropAudio.mockReset();
    mocks.updateCampaignVoicedropAudio.mockResolvedValue({ id: 1 });
  });

  test("uploads media and updates campaign, returning public url", async () => {
    queueDualAuthSession({ null: makeDbClient(), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/media");
    const fd = new FormData();
    fd.set("file", new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    fd.set("live_campaign_id", "1");
    fd.set("workspace_id", "w1");
    fd.set("campaign_name", "Camp");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toBe("https://public");
  });

  test("returns 500 on upload/update error", async () => {
    queueDualAuthSession({ null: makeDbClient({ uploadError: new Error("up") }), user: { id: "u1" } });
    const mod = await import("../app/routes/api+/media");
    const fd = new FormData();
    fd.set("file", new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any));
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalled();

    queueDualAuthSession({ null: makeDbClient(), user: { id: "u1" } });
    mocks.updateCampaignVoicedropAudio.mockResolvedValueOnce(null);
    const fd2 = new FormData();
    fd2.set("file", new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    fd2.set("live_campaign_id", "1");
    fd2.set("workspace_id", "w1");
    const res2 = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any));
    expect(res2.status).toBe(500);
  });
});
