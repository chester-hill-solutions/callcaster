import { describe, expect, test, vi, beforeEach } from "vitest";
import type { TenantDb } from "@/server/tenant-db";

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

const adminDbMocks = vi.hoisted(() => ({
  workspaceFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
}));

const workspaceUsersFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger.server", () => ({ logger }));
vi.mock("../app/lib/env.server", () => ({
  env: new Proxy(
    {},
    {
      get: (_target, _prop: string) => () => "test",
    },
  ),
}));
vi.mock("@/server/admin-db", () => ({
  adminDb: {
    query: {
      workspace: { findFirst: adminDbMocks.workspaceFindFirst },
      user: { findFirst: adminDbMocks.userFindFirst },
    },
  },
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    workspace_users: { findFirst: workspaceUsersFindFirst },
  })),
}));

function makeTdb(): TenantDb {
  return {
    workspace_users: { findFirst: workspaceUsersFindFirst },
  } as unknown as TenantDb;
}

describe("app/lib/database/stripe.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    logger.error.mockReset();
    logger.warn.mockReset();
    logger.info.mockReset();
    logger.debug.mockReset();
    adminDbMocks.workspaceFindFirst.mockReset();
    adminDbMocks.userFindFirst.mockReset();
    workspaceUsersFindFirst.mockReset();
  });

  test("createStripeContact: throws and logs on workspace query error", async () => {
    const customersCreate = vi.fn();

    vi.doMock("stripe", () => {
      class StripeMock {
        customers = { create: customersCreate };
        billing = { meterEvents: { create: vi.fn() } };
        constructor(..._args: unknown[]) {}
      }
      return { default: StripeMock };
    });

    adminDbMocks.workspaceFindFirst.mockRejectedValue(new Error("db"));

    const mod = await import("../app/lib/database/stripe.server");

    await expect(
      mod.createStripeContact({ workspace_id: "w1", tdb: makeTdb() }),
    ).rejects.toThrow("db");
    expect(logger.error).toHaveBeenCalled();
  });

  test("createStripeContact: validates owner presence and email", async () => {
    const customersCreate = vi.fn();

    vi.doMock("stripe", () => {
      class StripeMock {
        customers = { create: customersCreate };
        constructor(..._args: unknown[]) {}
      }
      return { default: StripeMock };
    });

    const mod = await import("../app/lib/database/stripe.server");

    adminDbMocks.workspaceFindFirst.mockResolvedValue({ name: "W" });
    workspaceUsersFindFirst.mockResolvedValue(null);
    await expect(
      mod.createStripeContact({ workspace_id: "w1", tdb: makeTdb() }),
    ).rejects.toThrow("No owner found for the workspace");

    workspaceUsersFindFirst.mockResolvedValue({ user_id: "u1" });
    adminDbMocks.userFindFirst.mockResolvedValue(null);
    await expect(
      mod.createStripeContact({ workspace_id: "w1", tdb: makeTdb() }),
    ).rejects.toThrow("No owner user found");

    adminDbMocks.userFindFirst.mockResolvedValue({ id: "u1", username: "" });
    await expect(
      mod.createStripeContact({ workspace_id: "w1", tdb: makeTdb() }),
    ).rejects.toThrow("Owner user has no email or username");
  });

  test("createStripeContact: creates stripe customer with name+email", async () => {
    const customersCreate = vi.fn(async (payload: Record<string, unknown>) => ({
      id: "cus_1",
      ...payload,
    }));

    vi.doMock("stripe", () => {
      class StripeMock {
        customers = { create: customersCreate };
        constructor(..._args: unknown[]) {}
      }
      return { default: StripeMock };
    });

    const mod = await import("../app/lib/database/stripe.server");

    adminDbMocks.workspaceFindFirst.mockResolvedValue({ name: "Workspace" });
    workspaceUsersFindFirst.mockResolvedValue({ user_id: "u1" });
    adminDbMocks.userFindFirst.mockResolvedValue({
      id: "u1",
      username: "owner@example.com",
    });

    const customer = await mod.createStripeContact({
      workspace_id: "w1",
      tdb: makeTdb(),
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
        constructor(..._args: unknown[]) {}
      }
      return { default: StripeMock };
    });

    const mod = await import("../app/lib/database/stripe.server");

    adminDbMocks.workspaceFindFirst.mockResolvedValue(undefined);
    await expect(
      mod.meterEvent({ workspace_id: "w1", amount: 1, type: "sms" }),
    ).resolves.toBeUndefined();

    adminDbMocks.workspaceFindFirst.mockResolvedValue({ stripe_id: null });
    await expect(
      mod.meterEvent({ workspace_id: "w1", amount: 1, type: "sms" }),
    ).resolves.toBeUndefined();
    expect(meterCreate).not.toHaveBeenCalled();
  });

  test("meterEvent sends stripe meter event when stripe_id is present", async () => {
    const meterCreate = vi.fn(async (payload: unknown) => ({ ok: 1, payload }));

    vi.doMock("stripe", () => {
      class StripeMock {
        billing = { meterEvents: { create: meterCreate } };
        constructor(..._args: unknown[]) {}
      }
      return { default: StripeMock };
    });

    const mod = await import("../app/lib/database/stripe.server");

    adminDbMocks.workspaceFindFirst.mockResolvedValue({ stripe_id: "cus_1" });

    const res = await mod.meterEvent({
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
