import { RouterContextProvider } from "react-router";
import type {
  DataPlaneAuthContextValue,
  SessionContextValue,
  WorkspaceContextValue,
} from "@/lib/route-context.server";

export type RouteContextMockOptions = {
  session?: SessionContextValue | null;
  workspace?: WorkspaceContextValue | null;
  dataPlane?: DataPlaneAuthContextValue | null;
};

async function loadRouteContextModule() {
  return import("@/lib/route-context.server");
}

export async function createRouteContextProvider(
  options: RouteContextMockOptions = {},
): Promise<RouterContextProvider> {
  const {
    dataPlaneAuthContext,
    sessionContext,
    workspaceContext,
  } = await loadRouteContextModule();
  const provider = new RouterContextProvider();
  if (options.session !== undefined) {
    provider.set(sessionContext, options.session);
  }
  if (options.workspace !== undefined) {
    provider.set(workspaceContext, options.workspace);
  }
  if (options.dataPlane !== undefined) {
    provider.set(dataPlaneAuthContext, options.dataPlane);
  }
  return provider;
}

export function mockWorkspaceContext(
  overrides: Partial<WorkspaceContextValue> = {},
): WorkspaceContextValue {
  return {
    workspaceId: "ws-1",
    userId: "user-1",
    userRole: "admin",
    headers: new Headers(),
    ...overrides,
  };
}

export function mockSessionContext(
  overrides: Partial<SessionContextValue> = {},
): SessionContextValue {
  return {
    user: { id: "user-1", email: "user@example.com" },
    headers: new Headers(),
    ...overrides,
  };
}

type RouteHandlerArgs = {
  context?: RouterContextProvider;
  params?: Record<string, string | undefined>;
};

/** Merge workspace middleware context into loader/action test args. */
export async function withWorkspaceRouteArgs<T extends RouteHandlerArgs>(
  args: T,
  workspaceOverrides: Partial<WorkspaceContextValue> = {},
): Promise<T & { context: RouterContextProvider }> {
  const workspaceId =
    workspaceOverrides.workspaceId ??
    args.params?.id ??
    args.params?.workspaceId ??
    "w1";
  return {
    ...args,
    context:
      args.context ??
      (await createRouteContextProvider({
        workspace: mockWorkspaceContext({
          workspaceId,
          ...workspaceOverrides,
        }),
      })),
  };
}
