import { describe, expect, test, vi, beforeEach } from "vitest";

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@/lib/logger.server", () => ({ logger }));
vi.mock("../app/lib/env.server", () => ({
  env: new Proxy(
    {},
    {
      get: (_target, _prop: string) => () => "test",
    },
  ),
}));

describe("app/lib/database/stripe.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    logger.error.mockReset();
    logger.warn.mockReset();
    logger.info.mockReset();
    logger.debug.mockReset();
  });

  test("createStripeContact: throws and logs on supabase error", async () => {
    const customersCreate = vi.fn();
    const meterCreate = vi.fn();

    vi.doMock("stripe", () => {
      class StripeMock {
        customers = { create: customersCreate };
        billing = { meterEvents: { create: meterCreate } };
        constructor(..._args: any[]) {}
      }
      return { default: StripeMock };
    });

    const mod = await import("../app/lib/database/stripe.server");

    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: new Error("db") }),
            }),
          }),
        }),
      }),
    };

    await expect(
      mod.createStripeContact({ supabaseClient: supabase, workspace_id: "w1" }),
    ).rejects.toThrow("db");
    expect(logger.error).toHaveBeenCalled();
  });

  test("createStripeContact: validates owner presence and email", async () => {
    const customersCreate = vi.fn();

    vi.doMock("stripe", () => {
      class StripeMock {
        customers = { create: customersCreate };
        constructor(..._args: any[]) {}
      }
      return { default: StripeMock };
    });

    const mod = await import("../app/lib/database/stripe.server");

    const supabaseNoOwner: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { name: "W", workspace_users: [] }, error: null }),
            }),
          }),
        }),
      }),
    };
    await expect(
      mod.createStripeContact({ supabaseClient: supabaseNoOwner, workspace_id: "w1" }),
    ).rejects.toThrow("No owner found for the workspace");

    const supabaseNoUser: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { name: "W", workspace_users: [{ user: null }] }, error: null }),
            }),
          }),
        }),
      }),
    };
    await expect(
      mod.createStripeContact({ supabaseClient: supabaseNoUser, workspace_id: "w1" }),
    ).rejects.toThrow("No owner user found");

    const supabaseNoEmail: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { name: "W", workspace_users: [{ user: { username: "" } }] }, error: null }),
            }),
          }),
        }),
      }),
    };
    await expect(
      mod.createStripeContact({ supabaseClient: supabaseNoEmail, workspace_id: "w1" }),
    ).rejects.toThrow("Owner user has no email or username");
  });

  test("createStripeContact: creates stripe customer with name+email", async () => {
    const customersCreate = vi.fn(async (payload: any) => ({ id: "cus_1", ...payload }));

    vi.doMock("stripe", () => {
      class StripeMock {
        customers = { create: customersCreate };
        constructor(..._args: any[]) {}
      }
      return { default: StripeMock };
    });

    const mod = await import("../app/lib/database/stripe.server");

    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  name: "Workspace",
                  workspace_users: [{ user: { username: "owner@example.com" } }],
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const customer = await mod.createStripeContact({
      supabaseClient: supabase,
      workspace_id: "w1",
    });
    expect(customer).toMatchObject({
      id: "cus_1",
      name: "Workspace",
      email: "owner@example.com",
    });
    expect(customersCreate).toHaveBeenCalledWith({
      name: "Workspace",
      email: "owner@example.com",
    });
  });

  test("meterEvent returns early when stripe_id is missing or query errors", async () => {
    const meterCreate = vi.fn();

    vi.doMock("stripe", () => {
      class StripeMock {
        billing = { meterEvents: { create: meterCreate } };
        constructor(..._args: any[]) {}
      }
      return { default: StripeMock };
    });

    const mod = await import("../app/lib/database/stripe.server");

    const supabaseErr: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error("x") }),
          }),
        }),
      }),
    };
    await expect(
      mod.meterEvent({ supabaseClient: supabaseErr, workspace_id: "w1", amount: 1, type: "sms" }),
    ).resolves.toBeUndefined();

    const supabaseNoId: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { stripe_id: null }, error: null }),
          }),
        }),
      }),
    };
    await expect(
      mod.meterEvent({ supabaseClient: supabaseNoId, workspace_id: "w1", amount: 1, type: "sms" }),
    ).resolves.toBeUndefined();
    expect(meterCreate).not.toHaveBeenCalled();
  });

  test("meterEvent sends stripe meter event when stripe_id is present", async () => {
    const meterCreate = vi.fn(async (payload: any) => ({ ok: 1, payload }));

    vi.doMock("stripe", () => {
      class StripeMock {
        billing = { meterEvents: { create: meterCreate } };
        constructor(..._args: any[]) {}
      }
      return { default: StripeMock };
    });

    const mod = await import("../app/lib/database/stripe.server");

    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { stripe_id: "cus_1" }, error: null }),
          }),
        }),
      }),
    };

    const res = await mod.meterEvent({
      supabaseClient: supabase,
      workspace_id: "w1",
      amount: 2,
      type: "sms",
    });
    expect(res).toMatchObject({ ok: 1 });
    expect(meterCreate).toHaveBeenCalledWith({
      event_name: "sms",
      payload: { value: "2", stripe_customer_id: "cus_1" },
    });
  });
});

