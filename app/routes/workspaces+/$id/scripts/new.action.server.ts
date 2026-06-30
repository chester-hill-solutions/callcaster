import { data as routeData, redirect } from "react-router";
import { updateCampaignScriptId } from "@/lib/campaign-ivr.server";
import { createWorkspaceScript } from "@/lib/script-api-db.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  const { headers, user } = await verifyAuth(request);

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
    } catch {
      return routeData(
        { success: false, error: "Invalid JSON file for steps" },
        { headers },
      );
    }
  } else {
    steps = { pages: {}, blocks: {} };
  }

  let createdScript;
  try {
    createdScript = await createWorkspaceScript({
      workspaceId,
      name,
      type,
      steps,
      createdBy: user?.id,
    });
  } catch (error) {
    return routeData({ success: false, error }, { headers });
  }

  if (!createdScript) {
    return routeData(
      { success: false, error: "Failed to create script" },
      { headers },
    );
  }

  if (ref) {
    const campaignId = Number(ref) || 0;
    const updatedCampaign = await updateCampaignScriptId(
      workspaceId,
      campaignId,
      createdScript.id,
    );
    if (!updatedCampaign) {
      return routeData(
        { success: false, error: "Failed to link script to campaign" },
        { headers },
      );
    }
  }

  return redirect(`../${createdScript.id}?created=1`, { headers });
}
