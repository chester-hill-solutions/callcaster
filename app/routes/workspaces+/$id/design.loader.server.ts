import { data as routeData } from "react-router";
import { isDesignGalleryEnabled } from "@/lib/env.server";
import { AppError, ErrorCode } from "@/lib/errors.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth: access }) => {
    if (!access.ok) {
      return access.response;
    }
    // A test-only workbench must not be a page workspace users can find.
    if (!isDesignGalleryEnabled()) {
      throw new AppError("Not found", 404, ErrorCode.NOT_FOUND);
    }
    return routeData(
      { ok: true, workspaceId: access.ctx.workspaceId },
      { headers: access.ctx.headers },
    );
  },
});
