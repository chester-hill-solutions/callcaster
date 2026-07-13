import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import { createEmptyAudience } from "@/lib/audience-upload-db.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const { headers, user, workspaceId } = auth;
    if (workspaceId == null) {
      return routeData(
        {
          success: false,
          error: "Workspace not found",
        },
        { headers },
      );
    }

    const formData = await request.formData();
    const formAction = formData.get("formAction") as string;
    const audienceName = formData.get("audience-name") as string;

    if (!audienceName) {
      return routeData(
        {
          success: false,
          error: "Audience name is required",
        },
        { headers },
      );
    }

    switch (formAction) {
      case "createAudience": {
        let audienceData;
        try {
          audienceData = await createEmptyAudience(workspaceId, audienceName);
        } catch (error) {
          return routeData(
            {
              success: false,
              error: error instanceof Error ? error.message : "Failed to create audience",
            },
            { headers },
          );
        }

        if (!audienceData) {
          return routeData(
            {
              success: false,
              error: "Failed to create audience",
            },
            { headers },
          );
        }

        return redirect(`/workspaces/${workspaceId}/audiences/${audienceData.id}`, { headers });
      }
      default:
        break;
    }

    return routeData({ success: false, error: "Form Action not recognized" }, { headers });
  },
});
