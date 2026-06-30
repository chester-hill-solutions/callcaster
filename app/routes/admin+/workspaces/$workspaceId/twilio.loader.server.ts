import { data as routeData, redirect } from "react-router";
import { loadTwilioData } from "./loadTwilioData.server";
import { requireSudoAdmin } from "../../requireSudoAdmin.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    await requireSudoAdmin(request);

    const workspaceId = params.workspaceId;
    if (!workspaceId) {
        throw redirect("/admin?tab=workspaces");
    }

    return routeData({
        twilioData: loadTwilioData(workspaceId),
    });
};
