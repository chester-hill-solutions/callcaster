import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/api-auth.server", async (importOriginal) => importOriginal());

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const authJsMocks = vi.hoisted(() => {
  return { rejectApiKeyLastUsedUpdate: false };
});

const workspaceMembersMocks = vi.hoisted(() => ({
  apiKeyRow: null as null | {
    id: string;
    workspace_id: string;
    key_hash: string;
  },
  touchWorkspaceApiKeyLastUsed: vi.fn(),
}));

let sessionUser: { id: string; email?: string } | null = null;

vi.mock("@/lib/auth.server", () => ({
  getSession: vi.fn(async () => ({
    session: sessionUser ? { token: "test-token", expiresAt: new Date(), userId: sessionUser.id } : null,
    user: sessionUser,
    headers: new Headers(),
  })),
  resolveBearerSessionUser: vi.fn(async (token: string) =>
    token === "valid-token" && sessionUser ? sessionUser : null,
  ),
}));

type ApiAuthModule = typeof import("@/lib/api-auth.server");

describe("verifyApiKeyOrSession", () => {
  let verifyApiKeyOrSession: ApiAuthModule["verifyApiKeyOrSession"];
  let hashApiKeyForStorage: ApiAuthModule["hashApiKeyForStorage"];
  let API_KEY_PREFIX_LENGTH: ApiAuthModule["API_KEY_PREFIX_LENGTH"];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/api-auth.server");
    verifyApiKeyOrSession = mod.verifyApiKeyOrSession;
    hashApiKeyForStorage = mod.hashApiKeyForStorage;
    API_KEY_PREFIX_LENGTH = mod.API_KEY_PREFIX_LENGTH;

    sessionUser = null;
    workspaceMembersMocks.apiKeyRow = null;
    workspaceMembersMocks.touchWorkspaceApiKeyLastUsed.mockReset();
    authJsMocks.rejectApiKeyLastUsedUpdate = false;
  });

  test("accepts X-API-Key header", async () => {
    const key = `cc_${"a".repeat(30)}`;
    const keyPrefix = key.slice(0, API_KEY_PREFIX_LENGTH);
    workspaceMembersMocks.apiKeyRow = {
      id: "key-1",
      workspace_id: "w1",
      key_hash: hashApiKeyForStorage(key),
    };

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": key },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({
      authType: "api_key",
      workspaceId: "w1",
    });
    expect(workspaceMembersMocks.apiKeyRow).toMatchObject({ key_hash: hashApiKeyForStorage(key) });
    expect(keyPrefix.length).toBe(API_KEY_PREFIX_LENGTH);
  });

  test("rejects invalid API key hash", async () => {
    const key = `cc_${"a".repeat(30)}`;
    workspaceMembersMocks.apiKeyRow = {
      id: "key-1",
      workspace_id: "w1",
      key_hash: "wrong-hash",
    };

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": key },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({ error: "Invalid API key", status: 401 });
  });

  test("accepts bearer session token", async () => {
    sessionUser = { id: "user-1", email: "a@b.com" };
    const req = new Request("http://localhost/api/me", {
      headers: { Authorization: "Bearer valid-token" },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({
      authType: "bearer",
      user: { id: "user-1", email: "a@b.com" },
    });
  });

  test("accepts cookie session via getSession", async () => {
    sessionUser = { id: "user-2" };
    const req = new Request("http://localhost/api/me");

    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({
      authType: "session",
      user: { id: "user-2" },
    });
  });

  test("rejects unauthenticated request", async () => {
    const req = new Request("http://localhost/api/me");
    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({ error: "Unauthorized", status: 401 });
  });

  test("touchWorkspaceApiKeyLastUsed failure is non-fatal", async () => {
    const key = `cc_${"b".repeat(30)}`;
    workspaceMembersMocks.apiKeyRow = {
      id: "key-2",
      workspace_id: "w2",
      key_hash: hashApiKeyForStorage(key),
    };
    authJsMocks.rejectApiKeyLastUsedUpdate = true;

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": key },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({ authType: "api_key", workspaceId: "w2" });
  });
});
