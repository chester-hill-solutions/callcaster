import { createContext } from "react-router";
import type { AuthUser } from "@/lib/auth.server";
import type { DataPlaneAuthContext } from "@/lib/platform-data.server";
import type { TenantDb } from "@/server/tenant-db";

export type SessionContextValue = {
  user: AuthUser;
  headers: Headers;
};

export type WorkspaceContextValue = {
  workspaceId: string;
  userId: string;
  userRole: string;
  headers: Headers;
  /**
   * Workspace-scoped Drizzle client, built once by workspace middleware.
   * Routes read this instead of constructing their own `createTenantDb`.
   */
  tdb: TenantDb;
};

export type DataPlaneActor = DataPlaneAuthContext & {
  workspaceId: string;
};

export type DataPlaneAuthContextValue = DataPlaneActor & {
  /**
   * Workspace-scoped Drizzle client, built once by data-plane middleware.
   */
  tdb: TenantDb;
};

export type AdminContextValue = {
  userId: string;
  accessLevel: string;
  headers: Headers;
  userData: import("@/lib/db-types").Database["public"]["Tables"]["user"]["Row"];
};

/** Set by auth layout loaders / session middleware upstream. */
export const sessionContext = createContext<SessionContextValue | null>(null);

/** Set by admin middleware on `admin+/` routes. */
export const adminContext = createContext<AdminContextValue | null>(null);

/** Set by workspace middleware on `workspaces+/$id` routes. */
export const workspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);

/** Set by data-plane middleware on `api+/workspaces+/$workspaceId/*`. */
export const dataPlaneAuthContext =
  createContext<DataPlaneAuthContextValue | null>(null);
