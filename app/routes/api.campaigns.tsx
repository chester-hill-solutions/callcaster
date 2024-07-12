import { json } from "@remix-run/node";
import {
  createSupabaseServerClient,
  getSupabaseServerClientWithSession,
} from "../lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient: supabase, serverSession } =
    await getSupabaseServerClientWithSession(request);
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

  let tableKey: "live_campaign" | "message_campaign" | "ivr_campaign" | null = null;
  if (type === "live_call" || !type) tableKey = "live_campaign";
  else if (type === "message") tableKey = "message_campaign";
  else if (["robocall", "simple_ivr", "complex_ivr"].includes(type)) tableKey = "ivr_campaign";

  if (!tableKey) {
    return json({ error: "Invalid campaign type" }, { status: 400 });
  }

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
          { error: "A campaign with this title already exists in the workspace" },
          { status: 400 }
        );
      }
      throw campaignError;
    }
    let updateData: any = {};
    if (tableKey === "live_campaign") {
      updateData.script_id = campaignDetails.script_id;
    } else if (tableKey === "message_campaign") {
      updateData.body_text = campaignDetails.body_text;
      updateData.message_media = campaignDetails.message_media;
    } else if (tableKey === "ivr_campaign") {
      updateData.step_data = step_data;
      updateData.script_id = campaignDetails.script_id;
    }

    const { data: updatedCampaignDetails, error: campaignDetailsError } = await supabase
      .from(tableKey)
      .update(updateData)
      .eq("campaign_id", id)
      .select();

    if (campaignDetailsError) throw campaignDetailsError;

    let updatedScript = null;
    if (campaignDetails.script && campaignDetails.script.id) {
      const { data: scriptData, error: scriptError } = await supabase
        .from("script")
        .upsert(
          {
            id: campaignDetails.script.id,
            steps: campaignDetails.script.steps,
            updated_at: new Date(),
            updated_by: serverSession.user.id,
          },
          {
            onConflict: 'id',
            ignoreDuplicates: false
          }
        )
        .select();

      if (scriptError) throw scriptError;
      updatedScript = scriptData[0];
      if (tableKey === "live_campaign" || tableKey === "ivr_campaign") {
        const { error: scriptIdUpdateError } = await supabase
          .from(tableKey)
          .update({ script_id: updatedScript.id })
          .eq("campaign_id", id);

        if (scriptIdUpdateError) throw scriptIdUpdateError;
      }
    }

    return json({
      campaign,
      campaignDetails: updatedCampaignDetails,
      script: updatedScript
    });

  } catch (error) {
    console.error("Error updating campaign:", error);
    return json({ error: (error as Error).message }, { status: 500 });
  }
};