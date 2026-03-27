import { json } from "@remix-run/node";
import { createCampaign, deleteCampaign, parseActionRequest, updateCampaign } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { createErrorResponse } from "@/lib/errors.server";

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
      return json({ campaign, campaignDetails: updatedCampaignDetails }, { headers });
    }

    if (request.method === "DELETE") {
      const campaignId = String(data.campaignId ?? "");
      await deleteCampaign({ supabase: supabaseClient, campaignId });
      return json({ success: true }, { headers });
    }

    if (request.method === "POST") {
      const campaignData = parseJsonField<Parameters<typeof createCampaign>[0]["campaignData"]>(data.campaignData);
      const { campaign, campaignDetails: createdCampaignDetails } = await createCampaign({
        supabase: supabaseClient,
        campaignData,
      });
      return json({ campaign, campaignDetails: createdCampaignDetails }, { headers });
    }

    return json({ error: "Method not allowed" }, { status: 405, headers });
  } catch (error) {
    return createErrorResponse(error, "Failed to process campaign request", 400, { headers });
  }
};
