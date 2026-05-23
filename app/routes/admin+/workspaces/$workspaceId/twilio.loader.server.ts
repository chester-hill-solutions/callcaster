import { data as routeData, type LoaderFunctionArgs, redirect } from "react-router";

import { requireSudoAdmin } from "../../requireSudoAdmin.server";
import { loadTwilioData } from "./loadTwilioData.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const { supabaseClient } = await requireSudoAdmin(request);

    const workspaceId = params.workspaceId;
    if (!workspaceId) {
        throw redirect("/admin?tab=workspaces");
    }

    return routeData({
        twilioData: loadTwilioData(supabaseClient, workspaceId),
    });
};
