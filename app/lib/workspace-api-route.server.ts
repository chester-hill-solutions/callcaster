import { jsonError } from "@/lib/platform-api.server";
import {
  resolveDataPlaneAuth,
  type DataPlaneAuthContext,
} from "@/lib/platform-data.server";
import { getUserRole } from "@/lib/database.server";
import { hasMinRole } from "@/lib/workspace-route.server";
import type { Database } from "@/lib/db-types";
import type { LoaderFunctionArgs } from "react-router";

export type WorkspaceApiLoaderContext = DataPlaneAuthContext & {
  workspaceId: string;
};

export type WorkspaceApiLoaderHandler = (
  ctx: WorkspaceApiLoaderContext,
  args: LoaderFunctionArgs,
) => Promise<Response>;

/**
 * Wraps nested `api/workspaces/:workspaceId/*` loaders with workspaceId guard
 * and data-plane auth resolution. Pass `{ minRole }` to enforce a minimum role.
 */
export function withWorkspaceApiLoader(
  handler: WorkspaceApiLoaderHandler,
  options?: { minRole?: string },
) {
  return async (args: LoaderFunctionArgs): Promise<Response> => {
    const workspaceId = args.params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }

    const auth = await resolveDataPlaneAuth(args.request, workspaceId);
    if (auth instanceof Response) {
      return auth;
    }

    if (options?.minRole && auth.userId) {
      const role = await getUserRole({user: { id: auth.userId },
        workspaceId,
      });
      if (!role || !["owner", "admin", "member", "caller"].includes(role.role)) {
        return jsonError("Workspace not found", 404, "not_found");
      }
      if (!hasMinRole(role.role, options.minRole)) {
        return jsonError("Insufficient role", 403, "forbidden");
      }
    }

    return handler({ ...auth, workspaceId }, args);
  };
}

export type WorkspaceApiActionHandler = (
  ctx: WorkspaceApiLoaderContext & { },
  args: LoaderFunctionArgs,
) => Promise<Response>;

/**
 * Same guard/auth as {@link withWorkspaceApiLoader} for workspace-scoped API actions.
 */
export function withWorkspaceApiAction(
  handler: WorkspaceApiActionHandler,
  options?: { minRole?: string },
) {
  return async (args: LoaderFunctionArgs): Promise<Response> => {
    const workspaceId = args.params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }

    const auth = await resolveDataPlaneAuth(args.request, workspaceId);
    if (auth instanceof Response) {
      return auth;
    }

    if (options?.minRole && auth.userId) {
      const role = await getUserRole({user: { id: auth.userId },
        workspaceId,
      });
      if (!role || !["owner", "admin", "member", "caller"].includes(role.role)) {
        return jsonError("Workspace not found", 404, "not_found");
      }
      if (!hasMinRole(role.role, options.minRole)) {
        return jsonError("Insufficient role", 403, "forbidden");
      }
    }

    return handler({ ...auth, workspaceId, client: auth.client }, args);
  };
}
