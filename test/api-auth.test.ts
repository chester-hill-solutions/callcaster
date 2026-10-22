import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/api-auth.server", async (importOriginal) => importOriginal());

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const authJsMocks = vi.hoisted(() => {
  return { rejectApiKeyLastUsedUpdate: false };
});

const membershipMocks = vi.hoisted(() => ({
  /** The creator's CURRENT role, or null when they left the workspace. */
  role: "admin" as string | null,
}));

vi.mock("@/lib/workspace-membership.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-membership.server")>()),
  getUserRole: vi.fn(async () =>
    membershipMocks.role === null ? null : { role: membershipMocks.role },
  ),
}));

const workspaceMembersMocks = vi.hoisted(() => ({
  apiKeyRow: null as null | {
    id: string;
    workspace_id: string;
    key_hash: string;
    key_prefix: string;
    scopes?: string[] | null;
    expires_at?: string | null;
    created_by?: string | null;
  },
  touchWorkspaceApiKeyLastUsed: vi.fn(),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  findWorkspaceApiKeyByPrefix: vi.fn((keyPrefix: string) => {
    return workspaceMembersMocks.apiKeyRow?.key_prefix === keyPrefix
      ? workspaceMembersMocks.apiKeyRow
      : null;
  }),
  touchWorkspaceApiKeyLastUsed: (...args: unknown[]) =>
    workspaceMembersMocks.touchWorkspaceApiKeyLastUsed(...args),
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
    membershipMocks.role = "admin";
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
      key_prefix: key.slice(0, API_KEY_PREFIX_LENGTH),
      created_by: "user-1",
    };

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": key },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({
      authType: "api_key",
      workspaceId: "w1",
      keyId: "key-1",
      scopes: [],
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
      key_prefix: key.slice(0, API_KEY_PREFIX_LENGTH),
      created_by: "user-1",
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

  function apiKeyRequest(key: string) {
    return new Request("http://localhost/api/chat_sms", { headers: { "X-API-Key": key } });
  }

  function keyMintedWith(scopes: string[], createdBy: string | null = "user-1") {
    const key = `cc_${"c".repeat(30)}`;
    workspaceMembersMocks.apiKeyRow = {
      id: "key-3",
      workspace_id: "w1",
      key_hash: hashApiKeyForStorage(key),
      key_prefix: key.slice(0, API_KEY_PREFIX_LENGTH),
      scopes,
      created_by: createdBy,
    };
    return key;
  }

  // #2894: a key is a bearer credential held FOR a member. When the member
  // goes, the credential must stop working the way their session does.
  test("refuses a key whose creator is no longer a member", async () => {
    const key = keyMintedWith(["campaigns.read"]);
    membershipMocks.role = null;

    const res = await verifyApiKeyOrSession(apiKeyRequest(key));
    expect(res).toMatchObject({ error: "Invalid API key", status: 401 });
  });

  test("refuses a key with no recorded creator", async () => {
    const key = keyMintedWith(["campaigns.read"], null);

    const res = await verifyApiKeyOrSession(apiKeyRequest(key));
    expect(res).toMatchObject({ error: "Invalid API key", status: 401 });
  });

  test("a demotion narrows the key to the creator's current role", async () => {
    // Minted with three capabilities; the creator is now a `member`, whose
    // role does not include campaigns.dispatch.
    const key = keyMintedWith([
      "campaigns.read",
      "campaigns.dispatch",
      "messages.send",
    ]);
    membershipMocks.role = "member";

    const res = await verifyApiKeyOrSession(apiKeyRequest(key));
    expect(res).toMatchObject({
      authType: "api_key",
      workspaceId: "w1",
      scopes: ["campaigns.read", "messages.send"],
    });
  });

  test("a key the creator still fully holds is unchanged", async () => {
    const key = keyMintedWith(["campaigns.read", "campaigns.dispatch"]);
    membershipMocks.role = "admin";

    const res = await verifyApiKeyOrSession(apiKeyRequest(key));
    expect(res).toMatchObject({
      authType: "api_key",
      scopes: ["campaigns.read", "campaigns.dispatch"],
    });
  });

  test("an unknown scope string is dropped rather than kept", async () => {
    const key = keyMintedWith(["campaigns.read", "not.a.capability"]);
    membershipMocks.role = "admin";

    const res = await verifyApiKeyOrSession(apiKeyRequest(key));
    expect(res).toMatchObject({ scopes: ["campaigns.read"] });
  });

  test("touchWorkspaceApiKeyLastUsed failure is non-fatal", async () => {
    const key = `cc_${"b".repeat(30)}`;
    workspaceMembersMocks.apiKeyRow = {
      id: "key-2",
      workspace_id: "w2",
      key_hash: hashApiKeyForStorage(key),
      key_prefix: key.slice(0, API_KEY_PREFIX_LENGTH),
      created_by: "user-1",
    };
    authJsMocks.rejectApiKeyLastUsedUpdate = true;

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": key },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({ authType: "api_key", workspaceId: "w2" });
  });
});
