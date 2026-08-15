import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const creditsState = vi.hoisted(() => ({
  balance: 10 as number | null,
}));

vi.mock("@/lib/workspace-credits.server", () => ({
  getWorkspaceCreditsBalance: vi.fn(async () => creditsState.balance),
}));

import {
  OUTBOUND_CREDITS_BLOCKED_BODY,
  outboundCreditsBlockedResponse,
  outboundCreditsResponse,
  requireOutboundCredits,
} from "@/lib/outbound-credit-gate.server";
import { AppError, ErrorCode } from "@/lib/errors.server";

function dataOf(result: unknown): { data: unknown; init?: { status?: number } } {
  return result as { data: unknown; init?: { status?: number } };
}

describe("requireOutboundCredits", () => {
  beforeEach(() => {
    creditsState.balance = 10;
  });

  test("ok:true with the balance when above the floor", async () => {
    creditsState.balance = 42;
    await expect(requireOutboundCredits("w1")).resolves.toEqual({
      ok: true,
      balance: 42,
    });
  });

  test("ok:false insufficient_credits at the floor (balance === 0)", async () => {
    creditsState.balance = 0;
    await expect(requireOutboundCredits("w1")).resolves.toEqual({
      ok: false,
      reason: "insufficient_credits",
      balance: 0,
    });
  });

  test("ok:false insufficient_credits below the floor (negative balance)", async () => {
    creditsState.balance = -5;
    await expect(requireOutboundCredits("w1")).resolves.toEqual({
      ok: false,
      reason: "insufficient_credits",
      balance: -5,
    });
  });

  test("ok:false workspace_not_found when balance is null", async () => {
    creditsState.balance = null;
    await expect(requireOutboundCredits("missing-workspace")).resolves.toEqual({
      ok: false,
      reason: "workspace_not_found",
    });
  });
});

describe("outboundCreditsResponse (distinguishes workspace_not_found)", () => {
  test("returns the locked 402 blocked shape for insufficient_credits", () => {
    const result = outboundCreditsResponse({
      ok: false,
      reason: "insufficient_credits",
      balance: 0,
    });
    const { data, init } = dataOf(result);
    expect(data).toEqual(OUTBOUND_CREDITS_BLOCKED_BODY);
    expect(data).toEqual({ error: "Insufficient credits", creditsError: true });
    expect(init?.status).toBe(402);
  });

  test("throws a uniform 404 AppError for workspace_not_found", () => {
    expect(() =>
      outboundCreditsResponse({ ok: false, reason: "workspace_not_found" }),
    ).toThrow(AppError);

    try {
      outboundCreditsResponse({ ok: false, reason: "workspace_not_found" });
      throw new Error("expected outboundCreditsResponse to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.message).toBe("Workspace not found");
      expect(appError.statusCode).toBe(404);
      expect(appError.code).toBe(ErrorCode.NOT_FOUND);
    }
  });
});

describe("outboundCreditsBlockedResponse (fail-closed, folds workspace_not_found in)", () => {
  test("always returns the locked 402 blocked shape", () => {
    const result = outboundCreditsBlockedResponse();
    const { data, init } = dataOf(result);
    expect(data).toEqual({ error: "Insufficient credits", creditsError: true });
    expect(init?.status).toBe(402);
  });
});
