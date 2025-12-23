import Twilio from "twilio";
import { json } from "@remix-run/node";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "@remix-run/node";

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

function normalizePhoneNumber(input: string): string {
  let cleaned = input.replace(/[^0-9+]/g, "");
  if (cleaned.indexOf("+") > 0) {
    cleaned = cleaned.replace(/\+/g, "");
  }
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  const validLength = 11;
  const minLength = 11;
  if (cleaned.length < minLength + 1) {
    cleaned = "+1" + cleaned.replace("+", "");
  }
  if (cleaned.length !== validLength + 1) {
    throw new Error("Invalid phone number length");
  }
  return cleaned;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const supabase: SupabaseClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );
    const { phoneNumber, workspace_id, friendlyName }: RequestBody =
      await request.json();

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
      statusCallback: `${process.env.BASE_URL}/api/caller-id/status`,
    }).catch((error) => console.log(error));
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
    console.error("Action error:", error);
    return json({ error: (error as Error).message }, { status: 500 });
  }
};
