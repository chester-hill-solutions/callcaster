import Twilio from "twilio";
import { json } from "@remix-run/node";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import { env } from "@/lib/env.server";
import { createErrorResponse } from "@/lib/errors.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import { normalizePhoneNumber } from "@/lib/utils";

interface WorkspaceData {
  key: string;
  token: string;
  twilio_data: {
    sid: string;
    authToken: string;
  };
}

interface RequestBody {
  phoneNumber: string;
  workspace_id: string;
  friendlyName: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient: userSupabase, user } = await verifyAuth(request);
  try {
    const supabase: SupabaseClient = createClient(
      env.SUPABASE_URL(),
      env.SUPABASE_SERVICE_KEY(),
    );
    const { phoneNumber, workspace_id, friendlyName }: RequestBody =
      await safeParseJson(request);

    await requireWorkspaceAccess({
      supabaseClient: userSupabase,
      user,
      workspaceId: workspace_id,
    });

    const { data, error } = await supabase
      .from("workspace")
      .select()
      .eq("id", workspace_id)
      .single();
    if (error) throw new Error(`Supabase query error: ${error.message}`);
    if (!data) throw new Error("No workspace data found");

    const workspaceData = data as WorkspaceData;

    if (!workspaceData.twilio_data) {
      throw new Error("Workspace twilio_data not found");
    }

    const twilio = new Twilio.Twilio(
      workspaceData.twilio_data.sid,
      workspaceData.twilio_data.authToken,
      {accountSid: workspaceData.twilio_data.sid}
    );

    const validationRequest = await twilio.validationRequests.create({
      friendlyName,
      phoneNumber,
      statusCallback: `${env.BASE_URL()}/api/caller-id/status`,
    });
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    const { data: numberRequest, error: numberError } = await supabase
      .from("workspace_number")
      .upsert(
        {
          workspace: workspace_id,
          friendly_name: friendlyName,
          phone_number: normalizedPhoneNumber,
          type: 'caller_id',
          capabilities: {
            fax: false,
            mms: false,
            sms: false,
            voice: false,
            verification_status: 'pending',
            emergency_address_status: 'not_started',
            emergency_address_sid: null,
            emergency_eligible: false,
            emergency_compliance_status: 'not_started',
          },
        },
        {
          onConflict: "phone_number, workspace",
        },
      )
      .select();

    if (numberError)
      throw new Error(
        `Error inserting workspace number: ${numberError.message}`,
      );

    return json({ validationRequest, numberRequest });
  } catch (error) {
    logger.error("Action error:", error);
    return createErrorResponse(error, "Failed to create caller ID");
  }
};
