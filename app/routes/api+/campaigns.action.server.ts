import { createCampaign, deleteCampaign, parseActionRequest, updateCampaign } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";

function parseJsonField<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

export const action = async ({ request }: { request: Request }) => {

  const { supabaseClient, headers } = await verifyAuth(request);

  try {
    const data = await parseActionRequest(request);

    if (request.method === "PATCH") {
      const campaignData = parseJsonField<Parameters<typeof updateCampaign>[0]["campaignData"]>(data.campaignData);
      const campaignDetails = parseJsonField<Parameters<typeof updateCampaign>[0]["campaignDetails"]>(data.campaignDetails);
      const { campaign, campaignDetails: updatedCampaignDetails } =
        await updateCampaign({ supabase: supabaseClient, campaignData, campaignDetails });
      return routeData({ campaign, campaignDetails: updatedCampaignDetails }, { headers });
    }

    if (request.method === "DELETE") {
      const campaignId = String(data.campaignId ?? "");
      await deleteCampaign({ supabase: supabaseClient, campaignId });
      return routeData({ success: true }, { headers });
    }

    if (request.method === "POST") {
      const campaignData = parseJsonField<Parameters<typeof createCampaign>[0]["campaignData"]>(data.campaignData);
      const { campaign, campaignDetails: createdCampaignDetails } = await createCampaign({
        supabase: supabaseClient,
        campaignData,
      });
      return routeData({ campaign, campaignDetails: createdCampaignDetails }, { headers });
    }

    return routeData({ error: "Method not allowed" }, { status: 405, headers });
  } catch (error) {
    return createErrorResponse(error, "Failed to process campaign request", 400, { headers });
  }
}
