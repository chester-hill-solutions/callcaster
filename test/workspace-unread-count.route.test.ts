import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), count: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getUserRole: mocks.role,
  fetchConversationSummary: mocks.list,
}));
vi.mock("@/lib/database/workspace-conversations.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace-conversations.server")>()),
  readWorkspaceUnreadConversationCount: mocks.count,
}));
import { loader } from "../app/routes/api+/workspaces+/$workspaceId/conversations.loader.server";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";
import { asRouteResponse } from "./helpers/route-result";

const workspaceId = "11111111-1111-4111-8111-111111111111";
async function request(query = "summary=unread", overrides: Record<string, unknown> = {}) {
  const args = await withDataPlaneRouteArgs({
    request: new Request(`http://localhost/api/workspaces/${workspaceId}/conversations?${query}`),
    params: { workspaceId },
  }, { workspaceId, ...overrides });
  return asRouteResponse(loader(args as never));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ role: "caller" });
  mocks.count.mockResolvedValue(107);
  mocks.list.mockResolvedValue({ chats: [], chatsError: null, hasMore: false });
});

test("the caller count mode returns a complete total, independently of list filters", async () => {
  const response = await request("summary=unread&page=2&page_size=10&campaign_id=1&search=other&sort=hasReplied");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ unread_count: 107 });
  expect(mocks.count).toHaveBeenCalledWith(workspaceId);
  expect(mocks.list).not.toHaveBeenCalled();
});
test("ordinary list requests keep their response and do not run the workspace aggregate", async () => {
  const response = await request("page=2&page_size=10");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ conversations: [], pagination: { page: 2, page_size: 10, has_more: false } });
  expect(mocks.count).not.toHaveBeenCalled();
});
test("database failure is a safe error, not an invented zero or raw SQL text", async () => {
  mocks.count.mockRejectedValue(new Error("private SQL connection and secret details"));
  const response = await request();
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ error: "Failed to load unread count" });
  expect(await response.text()).not.toContain("private SQL");
  expect(await response.text()).not.toContain("unread_count");
});
test("unknown summary modes fail before either data read", async () => {
  const response = await request("summary=arbitrary");
  expect(response.status).toBe(400);
  expect(mocks.count).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});
test("unauthenticated requests cannot read the count", async () => {
  const response = await request(undefined, { userId: null });
  expect(response.status).toBe(401);
  expect(mocks.count).not.toHaveBeenCalled();
});
test("nonmembers and cross-workspace contexts receive the uniform 404", async () => {
  mocks.role.mockResolvedValue(null);
  expect((await request()).status).toBe(404);
  expect((await request(undefined, { workspaceId: "22222222-2222-4222-8222-222222222222" })).status).toBe(404);
  expect(mocks.count).not.toHaveBeenCalled();
});
test.each([{ scopes: [] }, { scopes: ["campaigns.write"] }])("API key scopes $scopes cannot read the count", async ({ scopes }) => {
  const response = await request(undefined, { userId: null, apiKey: { keyId: "key-1", scopes } });
  expect(response.status).toBe(403);
  expect(mocks.count).not.toHaveBeenCalled();
});
test("an API key with campaigns.read can read the count without a session", async () => {
  const response = await request(undefined, { userId: null, apiKey: { keyId: "key-1", scopes: ["campaigns.read"] } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ unread_count: 107 });
  expect(mocks.role).not.toHaveBeenCalled();
});
