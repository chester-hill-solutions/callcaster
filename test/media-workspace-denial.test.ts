import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { AppError, ErrorCode } from "@/lib/errors.server";
import { action } from "@/routes/api+/media.action.server";
import { asRouteResponse } from "./helpers/route-result";
import { setDualAuthSession } from "./helpers/route-auth-mock";

const io = vi.hoisted(() => ({
  access: vi.fn(),
  upload: vi.fn(),
  sign: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: io.access,
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  uploadObject: io.upload,
  createSignedObjectUrl: io.sign,
}));
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  updateCampaignVoicedropAudio: io.update,
  findCampaignInWorkspace: vi.fn(async () => ({ id: 44 })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  io.access.mockResolvedValue(undefined);
  io.upload.mockResolvedValue(undefined);
  io.sign.mockResolvedValue("https://fixture.invalid/audio");
  io.update.mockResolvedValue({ id: 44 });
  setDualAuthSession({ user: { id: "member" } });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function encodedRequest() {
  const form = new FormData();
  form.set("file", new File(["audio"], "clip.mp3", { type: "audio/mpeg" }));
  form.set("workspace_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  form.set("live_campaign_id", "44");
  const wire = new Request("http://fixture.invalid/api/media", {
    method: "POST",
    body: form,
  });
  return new Request(wire.url, {
    method: "POST",
    headers: wire.headers,
    body: await wire.arrayBuffer(),
  });
}

function dispatch(request: Request) {
  return asRouteResponse(
    action({
      request,
      url: new URL(request.url),
      params: {},
      context: new RouterContextProvider(),
    }),
  );
}

function expectNoMediaWork(buffer: ReturnType<typeof vi.spyOn>) {
  expect(buffer).not.toHaveBeenCalled();
  expect(io.upload).not.toHaveBeenCalled();
  expect(io.sign).not.toHaveBeenCalled();
  expect(io.update).not.toHaveBeenCalled();
}

test.each([
  { status: 404, code: ErrorCode.NOT_FOUND, message: "Workspace not found" },
  {
    status: 403,
    code: ErrorCode.FORBIDDEN,
    message: "Access denied to workspace",
  },
])(
  "workspace denial retains $status before media work",
  async ({ status, code, message }) => {
    const request = await encodedRequest();
    const buffer = vi.spyOn(File.prototype, "arrayBuffer");
    io.access.mockRejectedValueOnce(new AppError(message, status, code));
    const response = await dispatch(request);
    expectNoMediaWork(buffer);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      error: message,
      code,
      statusCode: status,
    });
  },
);

test("a permitted member still uploads and attaches audio", async () => {
  const request = await encodedRequest();
  const buffer = vi.spyOn(File.prototype, "arrayBuffer");
  const response = await dispatch(request);
  expect(response.status).toBe(201);
  expect(await response.json()).toBe("https://fixture.invalid/audio");
  expect(buffer).toHaveBeenCalledOnce();
  expect(io.upload).toHaveBeenCalledOnce();
  expect(io.sign).toHaveBeenCalledOnce();
  expect(io.update).toHaveBeenCalledWith(
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    44,
    "https://fixture.invalid/audio",
  );
});

test.each([
  { name: "unauthenticated", session: { user: null } },
  { name: "API-key-only", session: {} },
])("$name caller remains refused", async ({ session }) => {
  setDualAuthSession(session);
  const request = await encodedRequest();
  const buffer = vi.spyOn(File.prototype, "arrayBuffer");
  const response = await dispatch(request);
  expect(response.status).toBe(401);
  expect(io.access).not.toHaveBeenCalled();
  expectNoMediaWork(buffer);
});

test("an unknown upload failure stays 500 without provider exception text", async () => {
  io.upload.mockRejectedValueOnce(new Error("private provider detail"));
  const response = await dispatch(await encodedRequest());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain(
    "private provider detail",
  );
  expect(io.sign).not.toHaveBeenCalled();
  expect(io.update).not.toHaveBeenCalled();
});

test("an unknown attachment failure cannot report success", async () => {
  io.update.mockRejectedValueOnce(new Error("private database detail"));
  const response = await dispatch(await encodedRequest());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain(
    "private database detail",
  );
});
