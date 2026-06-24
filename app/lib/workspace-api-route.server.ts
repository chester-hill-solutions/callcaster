import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError } from "@/lib/platform-api.server";
import {
  resolveDataPlaneAuth,
  type DataPlaneAuthContext,
} from "@/lib/platform-data.server";
import type { Database } from "@/lib/database.types";
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
 * and data-plane auth resolution.
 */
export function withWorkspaceApiLoader(handler: WorkspaceApiLoaderHandler) {
  return async (args: LoaderFunctionArgs): Promise<Response> => {
    const workspaceId = args.params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }

    const auth = await resolveDataPlaneAuth(args.request, workspaceId);
    if (auth instanceof Response) {
      return auth;
    }

    return handler({ ...auth, workspaceId }, args);
  };
}

export type WorkspaceApiActionHandler = (
  ctx: WorkspaceApiLoaderContext & { supabase: SupabaseClient<Database> },
  args: LoaderFunctionArgs,
) => Promise<Response>;

/**
 * Same guard/auth as {@link withWorkspaceApiLoader} for workspace-scoped API actions.
 */
export function withWorkspaceApiAction(handler: WorkspaceApiActionHandler) {
  return async (args: LoaderFunctionArgs): Promise<Response> => {
    const workspaceId = args.params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }

    const auth = await resolveDataPlaneAuth(args.request, workspaceId);
    if (auth instanceof Response) {
      return auth;
    }

    return handler({ ...auth, workspaceId, supabase: auth.supabase }, args);
  };
}
