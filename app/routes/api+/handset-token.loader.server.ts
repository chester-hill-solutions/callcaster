import { data as routeData } from "react-router";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { createErrorResponse } from "@/lib/errors.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-read"],
  handler: async ({ url, auth }) => {
    const workspace = url.searchParams.get("workspace") ?? "";

    // Derived from the session, never from the query string. This token is
    // minted with `incomingAllow: true` for the identity it names, so accepting
    // a caller-supplied one let any member — including the lowest `caller`
    // role — register as another member's handset and receive their inbound
    // calls. api+/token.loader.server.ts already binds identity this way.
    const clientIdentity = auth.user.id;

    if (!workspace) {
      return routeData({ error: "workspace is required" }, { status: 400 });
    }

    try {
      await requireWorkspaceAccess({
        user: auth.user,
        workspaceId: workspace,
      });

      const result = await createHandsetAccessToken({
        workspaceId: workspace,
        clientIdentity,
      });

      if (result.error) {
        const status = result.error === "Workspace not found" ? 404 : 400;
        return routeData({ error: result.error }, { status });
      }

      return routeData({ token: result.token });
    } catch (error) {
      return createErrorResponse(error, "Failed to generate handset token");
    }
  },
});
