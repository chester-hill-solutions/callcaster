import { data as routeData, redirect } from "react-router";
import { loadTwilioData } from "./loadTwilioData.server";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: adminRouteAuth,
  sideEffects: ["db-read", "twilio"],
  handler: ({ params }) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      throw redirect("/admin?tab=workspaces");
    }

    return routeData({
      twilioData: loadTwilioData(workspaceId),
    });
  },
});
