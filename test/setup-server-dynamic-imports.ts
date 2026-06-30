import { vi } from "vitest";

/**
 * Route modules use `await import("@/lib/*.server")` so per-file `vi.mock` of static
 * paths does not apply. Re-mock with importOriginal passthrough; individual tests
 * can still override exports via vi.mock in the test file (hoisted).
 */
async function passthrough<T extends Record<string, unknown>>(id: string) {
  const actual = await vi.importActual<T>(id);
  return { ...actual };
}

vi.mock("@/lib/database.server", () => passthrough("@/lib/database.server"));
vi.mock("@/lib/auth.server", () => passthrough("@/lib/auth.server"));
vi.mock("@/lib/logger.server", () => passthrough("@/lib/logger.server"));
vi.mock("@/lib/env.server", () => passthrough("@/lib/env.server"));
vi.mock("@/lib/errors.server", () => passthrough("@/lib/errors.server"));
vi.mock("@/lib/api-auth.server", () => passthrough("@/lib/api-auth.server"));
vi.mock("@/lib/messaging-onboarding.server", () =>
  passthrough("@/lib/messaging-onboarding.server"),
);
vi.mock("@/lib/admin-workspaces.server", () =>
  passthrough("@/lib/admin-workspaces.server"),
);
vi.mock("@/lib/transaction-history.server", () =>
  passthrough("@/lib/transaction-history.server"),
);
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils.server", () =>
  passthrough("@/lib/workspace-settings/WorkspaceSettingUtils.server"),
);
