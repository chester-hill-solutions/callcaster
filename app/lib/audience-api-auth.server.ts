import type {
  ApiKeyAuthResult,
  BearerSessionAuthResult,
  SessionAuthResult,
} from "@/lib/api-auth.server";
import { requireDualAuthCapability } from "@/lib/capability-guard.server";
import type { ProductCapabilityId } from "@/lib/capabilities";
import { AppError } from "@/lib/errors.server";

type DualAuthLike =
  | ApiKeyAuthResult
  | BearerSessionAuthResult
  | SessionAuthResult
  | { authType: string; workspaceId?: string };

/**
 * Flat `/api/audiences` dual-auth workspace gate + product capability check.
 * Shared by loader (read) and action (write) so capability wiring stays DRY.
 *
 * Still baselined in scripts/capability-baseline.json (issue #1242, D3): the
 * route has no `workspaceId`/resource-id path param — the caller passes an
 * `audienceId` or `workspaceId` via query string (GET) or a parsed body
 * (PATCH/DELETE), resolved dynamically before this runs. That's incompatible
 * with today's pre-request, route-param-shaped capability strategies
 * (`dataPlaneCapabilityAuth`, `dataPlaneCapabilityAuthForResource`), and this
 * path also supports bearer-token dual auth that those strategies don't.
 * Closing this baseline entry needs a body/query-aware strategy variant —
 * left for a follow-up.
 */
export async function requireAudienceWorkspaceAccess(args: {
  auth?: DualAuthLike;
  user?: { id: string };
  workspaceId: string;
  capability: ProductCapabilityId;
  requireWorkspaceAccess: (args: {
    user: { id: string };
    workspaceId: string;
  }) => Promise<void>;
}): Promise<void> {
  if (args.auth?.authType === "api_key") {
    if (args.auth.workspaceId !== args.workspaceId) {
      throw new AppError("Unauthorized", 403);
    }
  } else if (!args.user) {
    throw new AppError("Unauthorized", 401);
  } else {
    await args.requireWorkspaceAccess({
      user: args.user,
      workspaceId: args.workspaceId,
    });
  }

  if (
    args.auth &&
    (args.auth.authType === "api_key" ||
      args.auth.authType === "session" ||
      args.auth.authType === "bearer")
  ) {
    const gated = await requireDualAuthCapability({
      auth: args.auth as
        | ApiKeyAuthResult
        | BearerSessionAuthResult
        | SessionAuthResult,
      workspaceId: args.workspaceId,
      capability: args.capability,
    });
    if (gated instanceof Response) {
      throw gated;
    }
  }
}
