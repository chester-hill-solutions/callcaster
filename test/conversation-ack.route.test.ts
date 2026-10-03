import { beforeEach, describe, expect, test, vi } from "vitest";
import { action } from "../app/routes/api+/workspaces+/$workspaceId/conversations/$contactNumber.action.server";
import { loader } from "../app/routes/api+/workspaces+/$workspaceId/conversations/$contactNumber.loader.server";
import { capabilityOf } from "@/lib/handler.server";
import { API_SURFACE } from "@/lib/api-surface";
import { openApiSpec } from "@/lib/openapi";
import { completeOpenApiSpec } from "@/lib/openapi-complete";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";
import { asRouteResponse } from "./helpers/route-result";

vi.unmock("@/lib/api-auth.server");
const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  return {
    getUserRole: vi.fn(),
    markSid: vi.fn(),
    markPhone: vi.fn(),
    latest: vi.fn(),
    messages: vi.fn(),
  };
});
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getUserRole: (...args: unknown[]) => mocks.getUserRole(...args),
}));
vi.mock("@/lib/message-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/message-db.server")>()),
  markMessageAsDeliveredBySid: (...args: unknown[]) => mocks.markSid(...args),
  markReceivedMessagesAsDeliveredForPhone: (...args: unknown[]) =>
    mocks.markPhone(...args),
  fetchLatestMessageForPhone: (...args: unknown[]) => mocks.latest(...args),
}));
vi.mock("@/lib/platform-data.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-data.server")>()),
  getConversationMessagesApi: (...args: unknown[]) => mocks.messages(...args),
}));

const workspaceId = "ws-1";
const contactNumber = "%2B14165551234";
const params = { workspaceId, contactNumber };
const url = `http://localhost/api/workspaces/${workspaceId}/conversations/${contactNumber}`;
const key = (scopes: string[]) => ({
  userId: null,
  apiKey: { keyId: "key-1", scopes },
});
const modes = [
  { name: "specific message", body: { sid: "SM-received" } },
  { name: "conversation", body: {} },
];
function request(body: unknown = {}, method = "POST") {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function expectNoWrite() {
  expect(mocks.markSid).not.toHaveBeenCalled();
  expect(mocks.markPhone).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUserRole.mockResolvedValue({ role: "caller" });
  mocks.markSid.mockResolvedValue(undefined);
  mocks.markPhone.mockResolvedValue(undefined);
  mocks.latest.mockResolvedValue({ sid: "SM-latest" });
  mocks.messages.mockResolvedValue({
    contact_number: "+14165551234",
    messages: [],
    has_more: false,
  });
});

describe.each(modes)("conversation acknowledgment: $name", ({ body }) => {
  test.each([
    { scopes: [] },
    { scopes: ["messages.send"] },
    { scopes: ["campaigns.write"] },
  ])("rejects key scopes $scopes before writing", async ({ scopes }) => {
    const response = await asRouteResponse(
      action(
        await withDataPlaneRouteArgs(
          { request: request(body), params },
          key(scopes),
        ),
      ),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "capability_denied:campaigns.read",
    });
    expectNoWrite();
  });

  test("permits a key with campaigns.read without a session user", async () => {
    const response = await asRouteResponse(
      action(
        await withDataPlaneRouteArgs(
          { request: request(body), params },
          key(["campaigns.read"]),
        ),
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    if ("sid" in body) {
      expect(mocks.markSid).toHaveBeenCalledExactlyOnceWith(
        workspaceId,
        "SM-received",
      );
      expect(mocks.markPhone).not.toHaveBeenCalled();
    } else {
      expect(mocks.markPhone).toHaveBeenCalledExactlyOnceWith(
        workspaceId,
        "+14165551234",
      );
      expect(mocks.markSid).not.toHaveBeenCalled();
    }
    expect(mocks.getUserRole).not.toHaveBeenCalled();
  });

  test.each(["caller", "member", "admin", "owner"])(
    "permits the %s session role",
    async (role) => {
      mocks.getUserRole.mockResolvedValue({ role });
      const response = await asRouteResponse(
        action(
          await withDataPlaneRouteArgs({ request: request(body), params }),
        ),
      );
      expect(response.status).toBe(200);
      expect(mocks.getUserRole).toHaveBeenCalledExactlyOnceWith({
        user: { id: "user-1" },
        workspaceId,
      });
      expect(
        mocks.markSid.mock.calls.length + mocks.markPhone.mock.calls.length,
      ).toBe(1);
    },
  );

  test("rejects a missing actor", async () => {
    const response = await asRouteResponse(
      action(
        await withDataPlaneRouteArgs(
          { request: request(body), params },
          { userId: null },
        ),
      ),
    );
    expect(response.status).toBe(401);
    expectNoWrite();
  });

  test("returns a uniform 404 for a non-member", async () => {
    mocks.getUserRole.mockResolvedValue(null);
    const response = await asRouteResponse(
      action(await withDataPlaneRouteArgs({ request: request(body), params })),
    );
    expect(response.status).toBe(404);
    expectNoWrite();
  });

  test("rejects an unknown session role with no capability", async () => {
    mocks.getUserRole.mockResolvedValue({ role: "unknown" });
    const response = await asRouteResponse(
      action(await withDataPlaneRouteArgs({ request: request(body), params })),
    );
    expect(response.status).toBe(403);
    expectNoWrite();
  });

  test("rejects a key from another workspace", async () => {
    const response = await asRouteResponse(
      action(
        await withDataPlaneRouteArgs(
          { request: request(body), params },
          { ...key(["campaigns.read"]), workspaceId: "ws-other" },
        ),
      ),
    );
    expect(response.status).toBe(404);
    expectNoWrite();
  });

  test("reports a real writer failure as 500", async () => {
    mocks.markSid.mockRejectedValue(new Error("acknowledgment write failed"));
    mocks.markPhone.mockRejectedValue(new Error("acknowledgment write failed"));
    const response = await asRouteResponse(
      action(
        await withDataPlaneRouteArgs(
          { request: request(body), params },
          key(["campaigns.read"]),
        ),
      ),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "acknowledgment write failed",
    });
  });
});

test.each(["PUT", "PATCH", "DELETE"])(
  "permitted actor receives 405 for %s with no write",
  async (method) => {
    const response = await asRouteResponse(
      action(
        await withDataPlaneRouteArgs(
          { request: request({}, method), params },
          key(["campaigns.read"]),
        ),
      ),
    );
    expect(response.status).toBe(405);
    expectNoWrite();
  },
);

test.each([{ params: { workspaceId } }, { params: { contactNumber } }])(
  "missing route parameter returns 400 with no write",
  async ({ params: routeParams }) => {
    const response = await asRouteResponse(
      action(
        await withDataPlaneRouteArgs(
          { request: request(), params: routeParams },
          key(["campaigns.read"]),
        ),
      ),
    );
    expect(response.status).toBe(400);
    expectNoWrite();
  },
);

test("an empty body retains whole-conversation acknowledgment", async () => {
  const response = await asRouteResponse(
    action(
      await withDataPlaneRouteArgs(
        { request: new Request(url, { method: "POST" }), params },
        key(["campaigns.read"]),
      ),
    ),
  );
  expect(response.status).toBe(200);
  expect(mocks.markPhone).toHaveBeenCalledExactlyOnceWith(
    workspaceId,
    "+14165551234",
  );
});

test.each([{ latest: false }, { latest: true }])(
  "GET latest=$latest rejects an empty-scope key before reading",
  async ({ latest }) => {
    const response = await asRouteResponse(
      loader(
        await withDataPlaneRouteArgs(
          {
            request: new Request(`${url}${latest ? "?latest=1" : ""}`),
            params,
          },
          key([]),
        ),
      ),
    );
    expect(response.status).toBe(403);
    expect(mocks.latest).not.toHaveBeenCalled();
    expect(mocks.messages).not.toHaveBeenCalled();
  },
);

test.each([{ latest: false }, { latest: true }])(
  "GET latest=$latest permits campaigns.read",
  async ({ latest }) => {
    const response = await asRouteResponse(
      loader(
        await withDataPlaneRouteArgs(
          {
            request: new Request(`${url}${latest ? "?latest=1" : ""}`),
            params,
          },
          key(["campaigns.read"]),
        ),
      ),
    );
    expect(response.status).toBe(200);
    if (latest)
      expect(mocks.latest).toHaveBeenCalledExactlyOnceWith(
        workspaceId,
        "+14165551234",
      );
    else
      expect(mocks.messages).toHaveBeenCalledExactlyOnceWith(
        workspaceId,
        "+14165551234",
        expect.any(URLSearchParams),
      );
    expectNoWrite();
  },
);

test("runtime, generated surface and both served specs carry the same contract", () => {
  expect(capabilityOf(action)).toBe("campaigns.read");
  expect(capabilityOf(loader)).toBe("campaigns.read");
  const entry = API_SURFACE.find(
    (item) =>
      item.path === "/api/workspaces/:workspaceId/conversations/:contactNumber",
  );
  expect(entry).toMatchObject({
    authClass: "apiKeyOrSession",
    exposure: "publicSdk",
  });
  expect(entry?.operations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ method: "GET", capability: "campaigns.read" }),
      expect.objectContaining({ method: "POST", capability: "campaigns.read" }),
    ]),
  );
  for (const spec of [openApiSpec, completeOpenApiSpec]) {
    const path =
      spec.paths["/api/workspaces/{workspaceId}/conversations/{contactNumber}"];
    for (const method of ["get", "post"]) {
      expect(path[method]).toMatchObject({
        "x-callcaster-capability": "campaigns.read",
        "x-callcaster-auth-class": "apiKeyOrSession",
        "x-callcaster-exposure": "publicSdk",
        security: expect.arrayContaining([
          { apiKey: [] },
          { sessionCookie: [] },
        ]),
      });
    }
    expect(path.post.description).toContain(
      "acknowledges received messages as read",
    );
  }
});
