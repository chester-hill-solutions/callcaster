import { vi } from "vitest";

const routeAuthMocks = vi.hoisted(() => ({
  requireDualAuth: vi.fn(),
  requireJsonAuth: vi.fn(),
  requireSudo: vi.fn(),
  resolveDualAuthSession: vi.fn(),
  resolveJsonAuthSession: vi.fn(),
}));

vi.mock("@/lib/api-auth.server", () => {
  return {
    requireDualAuth: routeAuthMocks.requireDualAuth,
    requireJsonAuth: routeAuthMocks.requireJsonAuth,
    requireSudo: routeAuthMocks.requireSudo,
    resolveDualAuthSession: routeAuthMocks.resolveDualAuthSession,
    resolveJsonAuthSession: routeAuthMocks.resolveJsonAuthSession,
    getDualAuthUser: (auth: { authType?: string; user?: { id: string; email?: string } }) =>
      auth?.authType === "api_key" ? null : auth?.user ?? null,
  };
});

export function getRouteAuthMocks() {
  return routeAuthMocks;
}
