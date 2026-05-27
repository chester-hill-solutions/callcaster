import { createErrorResponse } from "@/lib/errors.server";
import { startWorkspaceCallerIdVerification } from "@/lib/caller-id-verification.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

interface RequestBody {
  phoneNumber: string;
  workspace_id: string;
  friendlyName: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient: userSupabase, user } = await verifyAuth(request);
  try {
    const { phoneNumber, workspace_id, friendlyName }: RequestBody =
      await safeParseJson(request);

    await requireWorkspaceAccess({
      supabaseClient: userSupabase,
      user,
      workspaceId: workspace_id,
    });

    const { validationRequest, numberRequest } = await startWorkspaceCallerIdVerification({
      supabaseClient: userSupabase,
      workspaceId: workspace_id,
      phoneNumber,
      friendlyName,
    });

    return routeData({ validationRequest, numberRequest });
  } catch (error) {
    logger.error("Action error:", error);
    return createErrorResponse(error, "Failed to create caller ID");
  }
};
