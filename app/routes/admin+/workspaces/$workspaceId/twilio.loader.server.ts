import { data as routeData, redirect } from "react-router";
import { loadTwilioData } from "./loadTwilioData.server";
import { getAdminRouteContext } from "@/lib/admin-route.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ context, params }: LoaderFunctionArgs) => {
    getAdminRouteContext(context);

    const workspaceId = params.workspaceId;
    if (!workspaceId) {
        throw redirect("/admin?tab=workspaces");
    }

    return routeData({
        twilioData: loadTwilioData(workspaceId),
    });
};
