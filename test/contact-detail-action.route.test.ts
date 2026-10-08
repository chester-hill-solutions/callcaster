import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

const dbMocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
  saveContactEditor: vi.fn(async (_workspaceId: string, id: number | null, values: Record<string, unknown>) => ({ id, ...values })),
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/database/workspace.server")>();
  return {
    ...actual,
    requireWorkspaceAccess: (...args: unknown[]) =>
      dbMocks.requireWorkspaceAccess(...args),
  };
});

vi.mock("@/server/contact-editor.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/contact-editor.server")>();
  return { ...actual, saveContactEditor: (...args: [string, number | null, Record<string, unknown>]) => dbMocks.saveContactEditor(...args) };
});

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function buildRequest(fields: Record<string, string>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return new Request("http://localhost/workspaces/w1/contacts/5", {
    method: "POST",
    body: fd,
  });
}

describe("workspaces_.$id.contacts.$contactId action", () => {
  beforeEach(() => {
    dbMocks.requireWorkspaceAccess.mockClear();
    dbMocks.saveContactEditor.mockClear();
  });

  test("rejects a caller (lowest role) with 403 and never touches the db", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/contacts/$contactId.action.server"
    );

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          {
            request: buildRequest({ firstname: "Jane", surname: "Doe" }),
            params: { id: "w1", contactId: "5" },
          },
          { userId: "u1", workspaceId: "w1", userRole: "caller" },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(dbMocks.requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(dbMocks.saveContactEditor).not.toHaveBeenCalled();
  });

  test("a member POST with real fields persists the typed values, not {}", async () => {
    const mod = await import(
      "../app/routes/workspaces+/$id/contacts/$contactId.action.server"
    );

    const res = await asRouteResponse(
      mod.action(
        await withWorkspaceRouteArgs(
          {
            request: buildRequest({
              firstname: "Jane",
              surname: "Doe",
              phone: "+15555550123",
              email: "jane@example.com",
            }),
            params: { id: "w1", contactId: "5" },
          },
          { userId: "u1", workspaceId: "w1", userRole: "member" },
        ),
      ),
    );

    expect(res.status).toBe(200);
    expect(dbMocks.saveContactEditor).toHaveBeenCalledTimes(1);
    expect(dbMocks.saveContactEditor).toHaveBeenCalledWith(
      "w1",
      5,
      expect.objectContaining({
        firstname: "Jane",
        surname: "Doe",
        phone: "+15555550123",
        email: "jane@example.com",
      }),
      { audienceIds: undefined, otherData: undefined },
    );
    const [, , updateValues] = dbMocks.saveContactEditor.mock.calls[0];
    expect(updateValues.firstname).toBe("Jane");
    expect(Object.keys(updateValues).length).toBeGreaterThan(1);
  });
});
