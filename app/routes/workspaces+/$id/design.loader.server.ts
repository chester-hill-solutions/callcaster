import { data as routeData } from "react-router";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth: access }) => {
    if (!access.ok) {
      return access.response;
    }
    return routeData(
      { ok: true, workspaceId: access.ctx.workspaceId },
      { headers: access.ctx.headers },
    );
  },
});
