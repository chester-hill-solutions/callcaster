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

vi.mock("@/lib/database/workspace.server", () =>
  passthrough("@/lib/database/workspace.server"),
);
vi.mock("@/lib/database/campaign.server", () =>
  passthrough("@/lib/database/campaign.server"),
);
vi.mock("@/lib/database/contact.server", () =>
  passthrough("@/lib/database/contact.server"),
);
vi.mock("@/lib/database/contact-audience.server", () =>
  passthrough("@/lib/database/contact-audience.server"),
);
vi.mock("@/lib/database/stripe.server", () =>
  passthrough("@/lib/database/stripe.server"),
);
vi.mock("@/lib/database/call-actions.server", () =>
  passthrough("@/lib/database/call-actions.server"),
);
vi.mock("@/lib/request-utils.server", () =>
  passthrough("@/lib/request-utils.server"),
);
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
