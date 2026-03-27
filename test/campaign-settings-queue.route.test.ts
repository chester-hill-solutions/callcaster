import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseActionRequest: vi.fn(),
    enqueueContactsForCampaign: vi.fn(),
  };
});

vi.mock("@/lib/supabase.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));

vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("../app/lib/database.server")>(
    "../app/lib/database.server",
  );
  return {
    ...actual,
    parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  };
});

vi.mock("@/lib/queue.server", () => ({
  enqueueContactsForCampaign: (...args: any[]) =>
    mocks.enqueueContactsForCampaign(...args),
}));

describe("workspaces_.$id.campaigns.$selected_id.queue action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.parseActionRequest.mockReset();
    mocks.enqueueContactsForCampaign.mockReset();
  });

  test("add_from_audience routes contacts through enqueue helper", async () => {
    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table !== "contact_audience") {
          throw new Error(`unexpected table ${table}`);
        }
        return {
          select: () => ({
            eq: async () => ({
              data: [{ contact_id: 11 }, { contact_id: 12 }],
              error: null,
            }),
          }),
        };
      }),
    };

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "add_from_audience",
      audienceId: "5",
    });

    const mod = await import(
      "../app/routing/workspace/workspaces_.$id.campaigns.$selected_id.queue"
    );
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { selected_id: "99" },
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(
      supabaseClient,
      99,
      [11, 12],
      { requeue: false },
    );
  });

  test("add_contacts routes direct contacts through enqueue helper", async () => {
    const supabaseClient = {
      from: vi.fn(() => {
        throw new Error("unexpected from()");
      }),
    };

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "add_contacts",
      contacts: [{ id: 21 }, { id: 22 }],
    });

    const mod = await import(
      "../app/routing/workspace/workspaces_.$id.campaigns.$selected_id.queue"
    );
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { selected_id: "77" },
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.enqueueContactsForCampaign).toHaveBeenCalledWith(
      supabaseClient,
      77,
      [21, 22],
      { requeue: false },
    );
  });

  test("add_from_audience returns contact lookup errors before enqueueing", async () => {
    const supabaseClient = {
      from: vi.fn(() => ({
        select: () => ({
          eq: async () => ({
            data: null,
            error: { message: "lookup failed" },
          }),
        }),
      })),
    };

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "add_from_audience",
      audienceId: "5",
    });

    const mod = await import(
      "../app/routing/workspace/workspaces_.$id.campaigns.$selected_id.queue"
    );
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { selected_id: "99" },
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "lookup failed",
    });
    expect(mocks.enqueueContactsForCampaign).not.toHaveBeenCalled();
  });

  test("loader keeps untouched queued contacts visible", async () => {
    const queueEqCalls: Array<[string, unknown]> = [];
    const queueQueryResult = { data: [], error: null, count: 0 };
    const queueChain: any = {
      select: () => queueChain,
      eq: (column: string, value: unknown) => {
        queueEqCalls.push([column, value]);
        return queueChain;
      },
      or: () => queueChain,
      ilike: () => queueChain,
      like: () => queueChain,
      in: () => queueChain,
      is: () => queueChain,
      not: () => queueChain,
      neq: () => queueChain,
      limit: () => queueChain,
      range: async () => queueQueryResult,
      then: (resolve: (value: typeof queueQueryResult) => unknown) =>
        Promise.resolve(resolve(queueQueryResult)),
    };
    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "campaign_audience") {
          return {
            select: () => ({
              eq: async () => ({
                data: [],
                error: null,
              }),
            }),
          };
        }

        if (table === "campaign_queue") {
          return queueChain;
        }

        throw new Error(`unexpected table ${table}`);
      }),
    };

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });

    const mod = await import(
      "../app/routing/workspace/workspaces_.$id.campaigns.$selected_id.queue"
    );

    await mod.loader({
      request: new Request("http://x/workspaces/w1/campaigns/99/queue"),
      params: { selected_id: "99" },
    } as any);

    expect(queueEqCalls).not.toContainEqual([
      "contact.outreach_attempt.campaign_id",
      "99",
    ]);
  });

  test("bulk status update no longer filters rows by outreach-attempt campaign id", async () => {
    const queueEqCalls: Array<[string, unknown]> = [];
    const filteredRows = [{ id: 11 }, { id: 12 }];
    const updateIn = vi.fn(async () => ({ error: null }));
    const queueQueryResult = { data: filteredRows, error: null, count: filteredRows.length };
    const queueChain: any = {
      select: () => queueChain,
      eq: (column: string, value: unknown) => {
        queueEqCalls.push([column, value]);
        return queueChain;
      },
      or: () => queueChain,
      ilike: () => queueChain,
      like: () => queueChain,
      in: () => queueChain,
      is: () => queueChain,
      not: () => queueChain,
      neq: () => queueChain,
      limit: () => queueChain,
      then: (resolve: (value: typeof queueQueryResult) => unknown) =>
        Promise.resolve(resolve(queueQueryResult)),
      update: () => ({
        in: updateIn,
      }),
    };
    const supabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "campaign_queue") {
          return queueChain;
        }

        throw new Error(`unexpected table ${table}`);
      }),
    };

    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient,
      user: { id: "u1" },
    });
    mocks.parseActionRequest.mockResolvedValueOnce({
      intent: "update_status",
      status: "paused",
      isAllSelected: true,
      filters: {
        name: "",
        phone: "",
        email: "",
        address: "",
        audiences: "",
        disposition: "",
        queueStatus: "",
      },
    });

    const mod = await import(
      "../app/routing/workspace/workspaces_.$id.campaigns.$selected_id.queue"
    );
    const res = await mod.action({
      request: new Request("http://x", { method: "POST" }),
      params: { selected_id: "99" },
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(queueEqCalls).not.toContainEqual([
      "contact.outreach_attempt.campaign_id",
      "99",
    ]);
    expect(updateIn).toHaveBeenCalledWith("id", [11, 12]);
  });
});
