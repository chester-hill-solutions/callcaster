import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import {
  getHandsetLoaderData,
  type HandsetLoaderData,
} from "@/lib/handset/handset-session.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { defineLoader } from "@/lib/handler.server";

export type { HandsetLoaderData };

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
    const { user } = auth;
    const workspaceId = params.id;
    if (!workspaceId) {
      throw new Response("Workspace not found", { status: 404 });
    }

    await requireWorkspaceAccess({user,
      workspaceId,
    });

    return getHandsetLoaderData({user,
      workspaceId,
    });
  },
});
