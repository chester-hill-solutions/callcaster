import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";
import type { Json } from "@/lib/database.types";

export async function action({ request, params }: ActionFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return routeData(
      { success: false, error: "Workspace does not exist" },
      { headers },
    );
  }

  const formData = await request.formData();
  const nameValue = formData.get("script-name");
  const typeValue = formData.get("type");
  const stepsFileValue = formData.get("steps");
  const refValue = formData.get("ref");

  if (!nameValue || typeof nameValue !== "string") {
    return routeData(
      { success: false, error: "Script name is required" },
      { headers },
    );
  }

  const name = nameValue;
  const type = typeof typeValue === "string" ? typeValue : "ivr";
  const ref = typeof refValue === "string" ? refValue : null;

  let steps: Record<string, unknown> = {};
  if (stepsFileValue instanceof File && stepsFileValue.size > 0) {
    try {
      const stepsContent = await stepsFileValue.text();
      steps = JSON.parse(stepsContent) as Record<string, unknown>;
    } catch (error) {
      return routeData(
        { success: false, error: "Invalid JSON file for steps" },
        { headers },
      );
    }
  } else {
    steps = { pages: {}, blocks: {} };
  }
  const { data, error } = await supabaseClient
    .from("script")
    .insert({
      name,
      type,
      steps: steps as Json,
      created_by: user?.id,
      workspace: workspaceId,
    })
    .select();
  if (ref && data && data.length > 0) {
    const createdScript = data[0];
    if (!createdScript) {
      return routeData(
        { success: false, error: "Failed to create script" },
        { headers },
      );
    }
    const tableKey = type === "script" ? "live_campaign" : "ivr_campaign";
    const { error: updateError } = await supabaseClient
      .from(tableKey)
      .update({ script_id: createdScript.id })
      .eq("campaign_id", Number(ref) || 0)
      .select();
    if (updateError) {
      return routeData(
        { success: false, error: updateError },
        { headers },
      );
    }
  }

  if (error) {
    return routeData({ success: false, error: error }, { headers });
  }

  if (!data || data.length === 0) {
    return routeData(
      { success: false, error: "Failed to create script" },
      { headers },
    );
  }

  return routeData({ data, success: true, error: null }, { headers });
}
