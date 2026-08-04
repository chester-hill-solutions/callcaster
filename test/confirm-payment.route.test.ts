import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, withRouteUrl } from "./helpers/route-result";

vi.mock("@/lib/env.server", () => {
  const handler = { get: (_target: unknown, prop: string) => () => `test-${prop}` };
  return { env: new Proxy({}, handler) };
});

const loggerError = vi.fn();
vi.mock("@/lib/logger.server", () => ({
  logger: {
    error: loggerError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const confirmStripeCheckoutSessionForRedirect = vi.fn();
vi.mock("@/lib/platform-billing.server", () => ({
  confirmStripeCheckoutSessionForRedirect,
}));

vi.mock("@/lib/auth.server", () => ({
  verifyAuth: vi.fn(async () => ({ user: { id: "u1" }, headers: new Headers() })),
}));

describe("confirm-payment route", () => {
  beforeEach(() => {
    confirmStripeCheckoutSessionForRedirect.mockReset();
    loggerError.mockReset();
  });

  test("records credits once across duplicate session confirmations", async () => {
    confirmStripeCheckoutSessionForRedirect.mockResolvedValue({
      ok: true,
      workspaceId: "w1",
      creditAmount: 250,
    });

    const mod = await import("../app/routes/confirm-payment");
    const request = new Request(
      "http://localhost/confirm-payment?session_id=sess_123",
    );

    const first = await asRouteResponse(mod.loader(withRouteUrl({ request } as any)));
    const second = await asRouteResponse(mod.loader(withRouteUrl({ request } as any)));

    expect(first.status).toBe(302);
    expect(second.status).toBe(302);
    expect(first.headers.get("Location")).toBe("/workspaces/w1/billing?payment_status=success&credits_added=250");
    expect(second.headers.get("Location")).toBe("/workspaces/w1/billing?payment_status=success&credits_added=250");
    expect(confirmStripeCheckoutSessionForRedirect).toHaveBeenCalledTimes(2);
    expect(confirmStripeCheckoutSessionForRedirect).toHaveBeenCalledWith({ sessionId: "sess_123" });
  }, 30000);

  test("redirects to workspace billing error when confirmation fails", async () => {
    confirmStripeCheckoutSessionForRedirect.mockResolvedValue({
      ok: false,
      workspaceId: "w1",
      error: new Error("insert failed"),
    });

    const mod = await import("../app/routes/confirm-payment");
    const response = await asRouteResponse(mod.loader(withRouteUrl({
      request: new Request("http://localhost/confirm-payment?session_id=sess_123"),
    } as any)));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/workspaces/w1/billing?payment_status=error&payment_message=We+could+not+confirm+this+payment+yet.+If+your+card+was+charged%2C+please+contact+support.",
    );
  }, 30000);

  test("redirects to workspaces when no session_id", async () => {
    const mod = await import("../app/routes/confirm-payment");
    const response = await asRouteResponse(mod.loader(withRouteUrl({
      request: new Request("http://localhost/confirm-payment"),
    } as any)));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/workspaces");
  });

  test("redirects to workspaces when confirmation fails without workspace", async () => {
    confirmStripeCheckoutSessionForRedirect.mockResolvedValue({
      ok: false,
      workspaceId: null,
      error: new Error("boom"),
    });

    const mod = await import("../app/routes/confirm-payment");
    const response = await asRouteResponse(mod.loader(withRouteUrl({
      request: new Request("http://localhost/confirm-payment?session_id=sess_123"),
    } as any)));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/workspaces?payment_status=error&payment_message=We%20could%20not%20confirm%20this%20payment.",
    );
  });
});
