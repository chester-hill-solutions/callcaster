import { RouterContextProvider } from "react-router";
import type {
  AdminContextValue,
  DataPlaneAuthContextValue,
  SessionContextValue,
  WorkspaceContextValue,
} from "@/lib/route-context.server";

export type RouteContextMockOptions = {
  session?: SessionContextValue | null;
  workspace?: WorkspaceContextValue | null;
  dataPlane?: DataPlaneAuthContextValue | null;
  admin?: AdminContextValue | null;
};

async function loadRouteContextModule() {
  return import("@/lib/route-context.server");
}

export async function createRouteContextProvider(
  options: RouteContextMockOptions = {},
): Promise<RouterContextProvider> {
  const {
    adminContext,
    dataPlaneAuthContext,
    sessionContext,
    workspaceContext,
  } = await loadRouteContextModule();
  const provider = new RouterContextProvider();
  if (options.session !== undefined) {
    provider.set(sessionContext, options.session);
  }
  if (options.admin !== undefined) {
    provider.set(adminContext, options.admin);
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
  request?: Request;
  url?: URL;
};

function withRouteUrl<T extends RouteHandlerArgs>(
  args: T,
): T & { url: URL } {
  if (args.url instanceof URL) {
    return args as T & { url: URL };
  }
  if (args.request) {
    return { ...args, url: new URL(args.request.url) };
  }
  return { ...args, url: new URL("http://localhost") };
}

export function mockDataPlaneContext(
  overrides: Partial<DataPlaneAuthContextValue> = {},
): DataPlaneAuthContextValue {
  return {
    userId: "user-1",
    workspaceId: "ws-1",
    ...overrides,
  };
}

/** Merge data-plane middleware context into loader/action test args. */
export async function withDataPlaneRouteArgs<T extends RouteHandlerArgs>(
  args: T,
  dataPlaneOverrides: Partial<DataPlaneAuthContextValue> = {},
): Promise<T & { context: RouterContextProvider; url: URL }> {
  const withUrl = withRouteUrl(args);
  const workspaceId =
    dataPlaneOverrides.workspaceId ??
    withUrl.params?.workspaceId ??
    "ws-1";
  return {
    ...withUrl,
    context:
      withUrl.context ??
      (await createRouteContextProvider({
        dataPlane: mockDataPlaneContext({
          workspaceId,
          ...dataPlaneOverrides,
        }),
      })),
  };
}

export function mockAdminContext(
  overrides: Partial<AdminContextValue> = {},
): AdminContextValue {
  return {
    userId: "admin-1",
    accessLevel: "sudo",
    headers: new Headers(),
    userData: {
      id: "admin-1",
      username: "ops@example.com",
      first_name: "Admin",
      access_level: "sudo",
    } as AdminContextValue["userData"],
    ...overrides,
  };
}

/** Merge admin middleware context into loader/action test args. */
export async function withAdminRouteArgs<T extends RouteHandlerArgs>(
  args: T,
  adminOverrides: Partial<AdminContextValue> = {},
): Promise<T & { context: RouterContextProvider; url: URL }> {
  const withUrl = withRouteUrl(args);
  return {
    ...withUrl,
    context:
      withUrl.context ??
      (await createRouteContextProvider({
        admin: mockAdminContext(adminOverrides),
      })),
  };
}

/** Merge workspace middleware context into loader/action test args. */
export async function withWorkspaceRouteArgs<T extends RouteHandlerArgs>(
  args: T,
  workspaceOverrides: Partial<WorkspaceContextValue> = {},
): Promise<T & { context: RouterContextProvider; url: URL }> {
  const withUrl = withRouteUrl(args);
  const workspaceId =
    workspaceOverrides.workspaceId ??
    withUrl.params?.id ??
    withUrl.params?.workspaceId ??
    "w1";
  return {
    ...withUrl,
    context:
      withUrl.context ??
      (await createRouteContextProvider({
        workspace: mockWorkspaceContext({
          workspaceId,
          ...workspaceOverrides,
        }),
      })),
  };
}
