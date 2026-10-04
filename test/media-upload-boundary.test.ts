import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { asRouteResponse } from "./helpers/route-result";
import { setDualAuthSession } from "./helpers/route-auth-mock";
import { action as audioAction } from "@/routes/api+/media.action.server";
import { action as messageAction } from "@/routes/api+/message_media.action.server";
const io = vi.hoisted(() => ({
  upload: vi.fn(),
  update: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  uploadObject: io.upload,
  createSignedObjectUrl: vi.fn(async () => "https://fixture.invalid/media"),
}));
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  updateCampaignVoicedropAudio: io.update,
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: io.access,
}));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: vi.fn(async () => ({
    headers: new Headers({ "X-Session-Proof": "retained" }),
  })),
}));
const cap = 10 * 1024 * 1024;
beforeEach(() => {
  vi.clearAllMocks();
  io.upload.mockResolvedValue(undefined);
  io.update.mockResolvedValue({ id: 44 });
  io.access.mockResolvedValue(undefined);
  setDualAuthSession({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } });
});
afterEach(() => {
  vi.restoreAllMocks();
});
async function requestFor(
  kind: "audio" | "message",
  size: number,
  campaignName = "Campaign",
  name = "fixture.mp3",
  type = "audio/mpeg",
) {
  const form = new FormData();
  const file = new File([new Uint8Array(size)], name, { type });
  if (kind === "audio") {
    form.set("file", file);
    form.set("workspace_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    form.set("live_campaign_id", "44");
    form.set("campaign_name", campaignName);
  } else {
    form.set("image", file);
    form.set("workspaceId", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    form.set("fileName", "fixture.mp3");
  }
  const request = new Request(
    "http://localhost/api/" + (kind === "audio" ? "media" : "message_media"),
    { method: "POST", body: form },
  );
  const bytes = await request.arrayBuffer();
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: bytes,
  });
}
function dispatch(kind: "audio" | "message", request: Request) {
  return asRouteResponse(
    (kind === "audio" ? audioAction : messageAction)({
      request,
      url: new URL(request.url),
      params: {},
      context: new RouterContextProvider(),
    }),
  );
}
async function send(
  kind: "audio" | "message",
  size: number,
  campaignName = "Campaign",
) {
  return dispatch(kind, await requestFor(kind, size, campaignName));
}
test("audio upload rejects one byte above the accepted 10 MiB cap before storage", async () => {
  const response = await send("audio", cap + 1);
  expect([400, 413]).toContain(response.status);
  expect(io.upload).not.toHaveBeenCalled();
  expect(io.update).not.toHaveBeenCalled();
});
test("audio at-cap positive control reaches the actual storage boundary", async () => {
  const response = await send("audio", cap);
  expect(response.status).toBe(201);
  expect(io.upload).toHaveBeenCalledTimes(1);
  expect(io.upload.mock.calls[0]?.[2].byteLength).toBe(cap);
});
test("message at-cap positive control reaches storage", async () => {
  const response = await send("message", cap);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true });
  expect(io.upload).toHaveBeenCalledTimes(1);
});
test("message route's existing cap rejects one byte above without storage", async () => {
  const response = await send("message", cap + 1);
  expect(await response.json()).toMatchObject({
    success: false,
    error: "File exceeds 10MB limit",
  });
  expect(io.upload).not.toHaveBeenCalled();
});
test("campaign name cannot inject traversal into the audio object key", async () => {
  const response = await send("audio", 1, "../../different/asset");
  expect(response.status).toBe(201);
  expect(io.upload.mock.calls[0]?.[1]).not.toContain("../");
});

test.each(["audio", "message"] as const)(
  "%s cap+1 rejects before parsed File.arrayBuffer",
  async (kind) => {
    const request = await requestFor(kind, 10485761);
    const allocation = vi.spyOn(File.prototype, "arrayBuffer");
    const response = await dispatch(kind, request);
    expect(await response.json()).toMatchObject({
      error: "File exceeds 10MB limit",
    });
    expect(allocation).not.toHaveBeenCalled();
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.update).not.toHaveBeenCalled();
  },
);
test("valid audio allocation control observes the parsed file", async () => {
  const request = await requestFor("audio", 1);
  const allocation = vi.spyOn(File.prototype, "arrayBuffer");
  expect((await dispatch("audio", request)).status).toBe(201);
  expect(allocation).toHaveBeenCalledTimes(1);
});
test.each([
  ["clip.aac", "audio/aac"],
  ["clip.flac", "audio/flac"],
  ["clip.m4a", "audio/m4a"],
  ["clip.mp3", "audio/mpeg"],
  ["clip.mp4", "video/mp4"],
  ["clip.oga", "audio/ogg"],
  ["clip.ogg", "audio/ogg"],
  ["clip.wav", "audio/wav"],
  ["clip.webm", "audio/webm"],
  ["clip.webm", "video/webm"],
])("audio retains %s format support", async (name, type) => {
  const request = await requestFor("audio", 1, "Campaign", name, type);
  expect((await dispatch("audio", request)).status).toBe(201);
  expect(io.upload).toHaveBeenCalledTimes(1);
});
test.each([
  { kind: "audio", name: "malware.exe", type: "audio/mpeg" },
  { kind: "audio", name: "clip.mp3", type: "text/html" },
  { kind: "message", name: "malware.exe", type: "image/png" },
  { kind: "message", name: "clip.mp3", type: "text/html" },
  { kind: "message", name: "clip.webm", type: "audio/webm" },
  { kind: "audio", name: "bad%ZZ.mp3", type: "audio/mpeg" },
  { kind: "message", name: "bad%ZZ.png", type: "image/png" },
] as const)(
  "$kind rejects invalid file $name / $type before storage",
  async ({ kind, name, type }) => {
    const request = await requestFor(kind, 1, "Campaign", name, type);
    const allocation = vi.spyOn(File.prototype, "arrayBuffer");
    const response = await dispatch(kind, request);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    expect(allocation).not.toHaveBeenCalled();
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.update).not.toHaveBeenCalled();
  },
);
test.each(["audio", "message"] as const)(
  "%s denied workspace does not write",
  async (kind) => {
    io.access.mockRejectedValueOnce(new Error("Denied workspace"));
    const response = await send(kind, 1);
    expect(response.status).toBe(500);
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.update).not.toHaveBeenCalled();
  },
);
test.each(["audio", "message"] as const)(
  "%s missing file returns validation error without writes",
  async (kind) => {
    const form = new FormData();
    form.set(
      kind === "audio" ? "workspace_id" : "workspaceId",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    form.set("live_campaign_id", "44");
    const response = await dispatch(
      kind,
      new Request("http://fixture.invalid", { method: "POST", body: form }),
    );
    expect(await response.json()).toMatchObject({
      error: "Invalid file upload",
    });
    expect(io.upload).not.toHaveBeenCalled();
  },
);
test.each(["audio", "message"] as const)(
  "%s rejects total multipart metadata overflow",
  async (kind) => {
    const form = new FormData();
    form.set(
      kind === "audio" ? "file" : "image",
      new File([new Uint8Array(10485760)], "clip.mp3", { type: "audio/mpeg" }),
    );
    form.set("metadata", "x".repeat(65536));
    const response = await dispatch(
      kind,
      new Request("http://fixture.invalid", { method: "POST", body: form }),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: "Request body exceeds the media upload limit",
    });
    if (kind === "message")
      expect(response.headers.get("X-Session-Proof")).toBe("retained");
    expect(io.upload).not.toHaveBeenCalled();
    expect(io.update).not.toHaveBeenCalled();
  },
);
test.each(["audio", "message"] as const)(
  "%s malformed multipart is a clear 400",
  async (kind) => {
    const response = await dispatch(
      kind,
      new Request("http://fixture.invalid", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=missing" },
        body: "invalid",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid form body" });
    if (kind === "message") {
      expect(await response.json()).toMatchObject({ success: false });
      expect(response.headers.get("X-Session-Proof")).toBe("retained");
    }
    expect(io.upload).not.toHaveBeenCalled();
  },
);
test("malformed percent-encoded deletion name returns the existing failure shape", async () => {
  const form = new URLSearchParams({
    workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    campaignId: "44",
    fileName: "bad%ZZ.png",
  });
  const response = await dispatch(
    "message",
    new Request("http://fixture.invalid", { method: "DELETE", body: form }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    success: false,
    error: "Invalid filename",
  });
  expect(response.headers.get("X-Session-Proof")).toBe("retained");
  expect(io.update).not.toHaveBeenCalled();
});
