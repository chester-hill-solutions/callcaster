import { vi } from "vitest";

const routeAuthMocks = vi.hoisted(() => ({
  requireDualAuth: vi.fn(),
  requireJsonAuth: vi.fn(),
  requireSudo: vi.fn(),
  resolveDualAuthSession: vi.fn(),
  resolveJsonAuthSession: vi.fn(),
}));

vi.mock("@/lib/api-auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-auth.server")>();
  return {
    ...actual,
    requireDualAuth: routeAuthMocks.requireDualAuth,
    requireJsonAuth: routeAuthMocks.requireJsonAuth,
    requireSudo: routeAuthMocks.requireSudo,
    resolveDualAuthSession: routeAuthMocks.resolveDualAuthSession,
    resolveJsonAuthSession: routeAuthMocks.resolveJsonAuthSession,
  };
});
