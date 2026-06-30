import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/api-auth.server", async (importOriginal) => importOriginal());

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const supabaseJsMocks = vi.hoisted(() => {
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

let sessionUser: any = null;
let sessionError: any = null;

vi.mock("@/lib/supabase.server", () => {
  return {
    createSupabaseServerClient: () => ({
      supabaseClient: {
        auth: {
          getUser: async () => ({ data: { user: sessionUser }, error: sessionError }),
        },
      },
      headers: new Headers(),
    }),
  };
});

vi.mock("@/lib/workspace-members-db.server", () => ({
  findWorkspaceApiKeyByPrefix: async () => workspaceMembersMocks.apiKeyRow,
  touchWorkspaceApiKeyLastUsed: (...args: unknown[]) => {
    if (supabaseJsMocks.rejectApiKeyLastUsedUpdate) {
      return Promise.reject(new Error("update failed"));
    }
    return workspaceMembersMocks.touchWorkspaceApiKeyLastUsed(...args);
  },
  getUserById: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: () => ({
      auth: { persistSession: false },
    }),
  };
});

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
    sessionError = null;
    workspaceMembersMocks.apiKeyRow = null;
    workspaceMembersMocks.touchWorkspaceApiKeyLastUsed.mockReset();
    supabaseJsMocks.rejectApiKeyLastUsedUpdate = false;
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

  test("accepts Authorization: Bearer header", async () => {
    const key = `cc_${"b".repeat(30)}`;
    workspaceMembersMocks.apiKeyRow = {
      id: "key-1",
      workspace_id: "w2",
      key_hash: hashApiKeyForStorage(key),
    };

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { Authorization: `Bearer ${key}` },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({
      authType: "api_key",
      workspaceId: "w2",
    });
  });

  test("rejects unknown API key prefix", async () => {
    const key = `cc_${"c".repeat(30)}`;
    workspaceMembersMocks.apiKeyRow = null;

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": key },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toEqual({ error: "Invalid API key", status: 401 });
  });

  test("rejects hash mismatch", async () => {
    const key = `cc_${"d".repeat(30)}`;
    workspaceMembersMocks.apiKeyRow = {
      id: "key-1",
      workspace_id: "w1",
      key_hash: hashApiKeyForStorage(`cc_${"x".repeat(30)}`),
    };

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": key },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toEqual({ error: "Invalid API key", status: 401 });
  });

  test("rejects when stored hash has unexpected length (secureCompare length mismatch)", async () => {
    const key = `cc_${"f".repeat(30)}`;
    workspaceMembersMocks.apiKeyRow = {
      id: "key-1",
      workspace_id: "w1",
      key_hash: "too-short",
    };

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": key },
    });

    const res = await verifyApiKeyOrSession(req);
    expect(res).toEqual({ error: "Invalid API key", status: 401 });
  });

  test("falls back to session when API key looks like cc_ but is too short", async () => {
    sessionUser = { id: "u2" };
    sessionError = null;
    const shortKey = `cc_${"a".repeat(API_KEY_PREFIX_LENGTH - 3)}`;
    expect(shortKey.length).toBe(API_KEY_PREFIX_LENGTH);
    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": shortKey },
    });
    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({ authType: "session", user: { id: "u2" } });
  });

  test("API key auth still succeeds even if last_used_at update fails", async () => {
    const key = `cc_${"e".repeat(30)}`;
    workspaceMembersMocks.apiKeyRow = {
      id: "key-1",
      workspace_id: "w1",
      key_hash: hashApiKeyForStorage(key),
    };
    supabaseJsMocks.rejectApiKeyLastUsedUpdate = true;

    const req = new Request("http://localhost/api/chat_sms", {
      headers: { "X-API-Key": key },
    });
    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({
      authType: "api_key",
      workspaceId: "w1",
    });
  });

  test("falls back to session auth when no API key, returns Unauthorized when no user", async () => {
    sessionUser = null;
    sessionError = null;
    const req = new Request("http://localhost/api/chat_sms");
    const res = await verifyApiKeyOrSession(req);
    expect(res).toEqual({ error: "Unauthorized", status: 401 });
  });

  test("falls back to session auth when no API key, returns session user when present", async () => {
    sessionUser = { id: "u1", email: "u1@example.com" };
    sessionError = null;
    const req = new Request("http://localhost/api/chat_sms");
    const res = await verifyApiKeyOrSession(req);
    expect(res).toMatchObject({
      authType: "session",
      user: { id: "u1" },
    });
  });
});
