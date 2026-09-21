import { RouterContextProvider } from "react-router";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import type {
  AdminContextValue,
  DataPlaneAuthContextValue,
  SessionContextValue,
  WorkspaceContextValue,
} from "@/lib/route-context.server";

/**
 * Lazy workspace-scoped client for tests.
 *
 * Built on first property access, so a test for a route that never reads
 * tenant data does not construct one. When a test mocks `@/server/tenant-db`,
 * the mock is what `createTenantDb` resolves to and its stub is returned.
 * When a test mocks only `@/server/db` with a partial client, construction
 * throws and a permissive stub is used instead.
 */
function lazyTdb(workspaceId: string): TenantDb {
  let cached: TenantDb | undefined;
  return new Proxy({} as TenantDb, {
    get(_target, prop) {
      if (!cached) {
        try {
          cached = createTenantDb(workspaceId);
        } catch {
          cached = makePermissiveTdb();
        }
      }
      return Reflect.get(cached as object, prop);
    },
  });
}

/** Returns a promise of an empty result for any table method. */
function makePermissiveTdb(): TenantDb {
  const callable: unknown = new Proxy(() => Promise.resolve([]), {
    get: () => callable,
    apply: () => Promise.resolve([]),
  });
  return callable as TenantDb;
}

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
  const workspaceId = overrides.workspaceId ?? "ws-1";
  return {
    workspaceId,
    userId: "user-1",
    userRole: "admin",
    headers: new Headers(),
    // Lazy: only built if the route under test actually reads tenant data.
    tdb: lazyTdb(workspaceId),
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
  const workspaceId = overrides.workspaceId ?? "ws-1";
  return {
    userId: "user-1",
    workspaceId,
    // Lazy: see lazyTdb. A test's `@/server/tenant-db` mock flows through.
    tdb: lazyTdb(workspaceId),
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
