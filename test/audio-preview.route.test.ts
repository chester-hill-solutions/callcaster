import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  workspaceLoaderAuth: vi.fn(),
  createSignedObjectUrl: vi.fn(),
}));

vi.mock("@/lib/workspace-route.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace-route.server")>();
  return {
    ...actual,
    workspaceLoaderAuth: (...args: unknown[]) => mocks.workspaceLoaderAuth(...args),
  };
});

vi.mock("@/lib/object-storage.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/object-storage.server")>();
  return {
    ...actual,
    createSignedObjectUrl: (...args: unknown[]) => mocks.createSignedObjectUrl(...args),
  };
});

function memberAuth(workspaceId = "ws-1") {
  return {
    ok: true,
    ctx: { headers: new Headers({ "Set-Cookie": "session=abc" }), workspaceId },
  };
}

async function runLoader(fileName: string) {
  const mod = await import("../app/routes/workspaces+/$id/audios/$fileName.preview.route");
  const request = new Request(`http://x/workspaces/ws-1/audios/${encodeURIComponent(fileName)}/preview`);
  return asRouteResponse(
    mod.loader({ request, params: { id: "ws-1", fileName }, context: new Map() } as never),
  );
}

describe("GET /workspaces/:id/audios/:fileName/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceLoaderAuth.mockResolvedValue(memberAuth());
    mocks.createSignedObjectUrl.mockResolvedValue("https://bucket.example/ws-1/greeting.mp3?sig=1");
  });

  test("redirects a member to a short-lived signed URL for the workspace's object", async () => {
    const res = await runLoader("greeting.mp3");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://bucket.example/ws-1/greeting.mp3?sig=1");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    // Session headers from the auth context are forwarded.
    expect(res.headers.get("Set-Cookie")).toBe("session=abc");
    expect(mocks.createSignedObjectUrl).toHaveBeenCalledWith(
      "workspaceAudio",
      "ws-1/greeting.mp3",
      300,
    );
  });

  test("the object key is scoped to the authenticated workspace, not the URL", async () => {
    mocks.workspaceLoaderAuth.mockResolvedValue(memberAuth("ws-real"));
    await runLoader("greeting.mp3");
    expect(mocks.createSignedObjectUrl).toHaveBeenCalledWith(
      "workspaceAudio",
      "ws-real/greeting.mp3",
      300,
    );
  });

  test("rejects path traversal in the file name before touching storage", async () => {
    const res = await runLoader("../other-workspace/secret.mp3");
    expect(res.status).toBe(404);
    expect(mocks.createSignedObjectUrl).not.toHaveBeenCalled();
  });

  test("a non-member gets the auth response and never reaches storage", async () => {
    const denied = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    mocks.workspaceLoaderAuth.mockResolvedValue({ ok: false, response: denied });
    const res = await runLoader("greeting.mp3");
    expect(res.status).toBe(403);
    expect(mocks.createSignedObjectUrl).not.toHaveBeenCalled();
  });
});
