import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";

/**
 * Columns that must never reach a client route payload:
 *   - key / token   — Twilio API key SID + secret pair (ADR-0011)
 *   - twilio_data   — JSON blob holding the Twilio account SID + authToken
 *   - stripe_id     — Stripe customer id
 * `authToken` is not a workspace column; it lives inside twilio_data. It is
 * asserted on anyway so a future promotion to a real column is caught here.
 */
const FORBIDDEN_KEYS = [
  "authToken",
  "token",
  "key",
  "stripe_id",
  "twilio_data",
] as const;

const workspaceId = "11111111-1111-1111-1111-111111111111";

/** A full `workspace` row as it exists in the database — secrets included. */
function fullWorkspaceRow(): Record<string, unknown> {
  return {
    id: workspaceId,
    name: "Workspace",
    created_at: "2026-01-01T00:00:00.000Z",
    credits: 42,
    disabled: false,
    feature_flags: {},
    coaching_config: null,
    owner: "u1",
    users: ["u1"],
    // Secrets — must never leave the database.
    key: "SK-super-secret-api-key",
    token: "twilio-api-secret",
    stripe_id: "cus_secret",
    twilio_data: JSON.stringify({
      sid: "AC123",
      authToken: "twilio-auth-token-secret",
    }),
  };
}

const dbMocks = vi.hoisted(() => ({
  selectArgs: [] as unknown[],
}));

/**
 * Stub of the admin Drizzle client that faithfully simulates a SQL-level
 * column projection:
 *   - `select(cols)` resolves to a row containing ONLY the keys of `cols`
 *   - bare `select()` resolves to the FULL row, secrets and all
 * So if `getWorkspaceForClient` ever regresses to a bare `select()`, the
 * secrets flow into the loader payload and these tests fail.
 */
vi.mock("@/server/admin-db", () => {
  const makeChain = (cols?: Record<string, unknown>) => {
    const row = fullWorkspaceRow();
    const projected =
      cols === undefined
        ? row
        : Object.fromEntries(Object.keys(cols).map((k) => [k, row[k]]));
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "limit", "orderBy"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve([projected]).then(resolve, reject);
    return chain;
  };

  return {
    adminDb: {
      select: vi.fn((cols?: Record<string, unknown>) => {
        dbMocks.selectArgs.push(cols);
        return makeChain(cols);
      }),
    },
  };
});

vi.mock("@/server/db", () => ({ db: {} }));

const tdbMocks = vi.hoisted(() => ({
  campaign: { findMany: vi.fn(async () => []) },
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tdbMocks),
}));

const routeMocks = vi.hoisted(() => ({
  workspaceLoaderAuth: vi.fn(),
}));

vi.mock("@/lib/workspace-route.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/workspace-route.server")>();
  return {
    ...actual,
    workspaceLoaderAuth: (...args: unknown[]) =>
      routeMocks.workspaceLoaderAuth(...args),
  };
});

const platformMocks = vi.hoisted(() => ({
  listWorkspaceAudiencesApi: vi.fn(async () => ({
    ok: true as const,
    audiences: [],
  })),
}));

vi.mock("@/lib/platform-data.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/platform-data.server")>();
  return {
    ...actual,
    listWorkspaceAudiencesApi: (...args: unknown[]) =>
      platformMocks.listWorkspaceAudiencesApi(...args),
  };
});

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** Recursively assert no forbidden key appears anywhere in a payload. */
function expectNoSecrets(payload: unknown) {
  const serialized = JSON.stringify(payload) ?? "";
  for (const forbidden of FORBIDDEN_KEYS) {
    expect(serialized).not.toContain(`"${forbidden}"`);
  }
  // Also assert the secret *values* never appear, in case a loader renames a field.
  for (const secret of [
    "SK-super-secret-api-key",
    "twilio-api-secret",
    "cus_secret",
    "twilio-auth-token-secret",
  ]) {
    expect(serialized).not.toContain(secret);
  }
}

describe("workspace route loaders do not leak workspace secrets", () => {
  beforeEach(() => {
    dbMocks.selectArgs.length = 0;
    routeMocks.workspaceLoaderAuth.mockReset();
    routeMocks.workspaceLoaderAuth.mockResolvedValue({
      ok: true,
      ctx: {
        headers: new Headers(),
        workspaceId,
        userRole: "owner",
        user: { id: "u1" },
      },
    });
  });

  test("getWorkspaceForClient projects columns in SQL, excluding secrets", async () => {
    const { getWorkspaceForClient } = await import(
      "@/lib/workspace-members-db.server"
    );

    const row = await getWorkspaceForClient(workspaceId);

    // The projection must be passed to select(), not applied after the fact.
    const cols = dbMocks.selectArgs.at(-1);
    expect(cols).toBeTypeOf("object");
    expect(cols).not.toBeUndefined();

    const projectedKeys = Object.keys(cols as Record<string, unknown>);
    expect(projectedKeys).toContain("id");
    expect(projectedKeys).toContain("name");
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(projectedKeys).not.toContain(forbidden);
    }

    expect(row).not.toBeNull();
    expectNoSecrets(row);
  });

  test("getWorkspaceById still returns secrets for server-only callers", async () => {
    const { getWorkspaceById } = await import(
      "@/lib/workspace-members-db.server"
    );

    const row = await getWorkspaceById(workspaceId);

    // Server-only callers (Twilio webhooks, token minting, admin) rely on this.
    expect(row).toMatchObject({ twilio_data: expect.any(String) });
    expect(dbMocks.selectArgs.at(-1)).toBeUndefined();
  });

  test("audiences loader payload contains no workspace secrets", async () => {
    const mod = await import("../app/routes/workspaces+/$id/audiences.loader.server");

    const res = await asRouteResponse(
      mod.loader({
        request: new Request(`http://localhost/workspaces/${workspaceId}/audiences`),
        params: { id: workspaceId },
        context: {},
      } as never),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expectNoSecrets(body);
    expect(body).toMatchObject({ workspace: { id: workspaceId, name: "Workspace" } });
  });
});
