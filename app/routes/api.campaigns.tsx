import { json } from "@remix-run/node";
import { createSupabaseServerClient } from "../lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient: supabase } =
    await createSupabaseServerClient(request);
  const data = await request.json();
  const {
    id,
    title,
    status,
    type,
    dial_type,
    group_household_queue,
    caller_id,
    start_date,
    end_date,
    voicemail_file,
    workspace,
    dial_ratio,
    step_data,
    campaignDetails,
  } = data;

  let tableKey: "live_campaign" | "message_campaign" | "ivr_campaign" | null =
    null;
  if (type === "live_call" || !type) tableKey = "live_campaign";
  else if (type === "message") tableKey = "message_campaign";
  else if (["robocall", "simple_ivr", "complex_ivr"].includes(type))
    tableKey = "ivr_campaign";
  try {
    const { data: campaign, error: campaignError } = await supabase
      .from("campaign")
      .update({
        title,
        status,
        type,
        dial_type,
        group_household_queue,
        caller_id,
        start_date,
        end_date,
        voicemail_file,
        dial_ratio,
      })
      .eq("id", id)
      .eq("workspace", workspace)
      .select();

    if (campaignError) {
      if (campaignError.code === "23505") {
        return json(
          {
            error: "A campaign with this title already exists in the workspace",
          },
          { status: 400 },
        );
      }
      throw campaignError;
    }
    let updatedCampaignDetails = null;
    if (tableKey && tableKey !== "live_campaign") {
      let updateData: any = {};
      if (tableKey === "message_campaign") {
        updateData.body_text = campaignDetails.body_text;
        updateData.message_media = campaignDetails.message_media;
      } else if (tableKey === "ivr_campaign") {
        updateData.step_data = step_data;
      }

      const { data: detailsData, error: campaignDetailsError } = await supabase
        .from(tableKey)
        .update(updateData)
        .eq("campaign_id", id)
        .select();
      if (campaignDetailsError) throw campaignDetailsError;
      updatedCampaignDetails = detailsData;
    } else {
      const { data: detailsData, error: campaignDetailsError } = await supabase
        .from("live_campaign")
        .update({...campaignDetails})
        .eq("campaign_id", id)
        .select();
      if (campaignDetailsError) throw campaignDetailsError;
      updatedCampaignDetails = detailsData;
    }

    return json({ campaign, campaignDetails: updatedCampaignDetails });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return json({ error: (error as Error).message }, { status: 500 });
  }
};
