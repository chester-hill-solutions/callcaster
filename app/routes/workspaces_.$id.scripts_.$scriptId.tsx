import { json, redirect, LoaderFunctionArgs, ActionFunctionArgs  } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";
import { verifyAuth } from "@/lib/supabase.server";
import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import { deepEqual } from "@/lib/utils";
import { SaveBar } from "@/components/shared/SaveBar";
import { getUserRole, listMedia } from "@/lib/database.server";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Script, WorkspaceData } from "@/lib/types";
import { MemberRole } from "@/components/workspace/TeamMember";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger.server";
import {
  normalizeScriptForComparison,
  normalizeScriptPageDataForComparison,
} from "@/lib/script-change";
  
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, scriptId: selected_id } = params;
  const { supabaseClient, headers, user } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin");
  }
  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspace_id as string)
    .single();
  if (workspaceError) throw workspaceError;
  const userRole = await getUserRole({ supabaseClient: supabaseClient as SupabaseClient, user, workspaceId: workspace_id as string });
  const { data: script } = await supabaseClient
    .from("script")
    .select()
    .eq("workspace", workspace_id as string)
    .eq("id", Number(selected_id) || 0)
    .single();

  const mediaNames = await listMedia(supabaseClient, workspace_id as string );
  return json({
    workspace: workspaceData,
    workspace_id,
    selected_id,
    script,
    mediaNames,
    userRole,
  });
};
export { ErrorBoundary };

export const action = async ({ request, params }: ActionFunctionArgs  ) => {
  const campaignId = params.selected_id;
  const formData = await request.formData();
  const mediaName = formData.get("fileName") as string;
  const encodedMediaName = encodeURI(mediaName);

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const { data: campaign, error } = await supabaseClient
    .from("message_campaign")
    .select("id, message_media")
    .eq("campaign_id", Number(campaignId) || 0)
    .single();
  if (error) {
    logger.error("Campaign Error", error);
    return json({ success: false, error: error }, { headers });
  }
  const { data: campaignUpdate, error: updateError } = await supabaseClient
    .from("message_campaign")
    .update({
      message_media: campaign.message_media?.filter(
        (med) => med !== encodedMediaName,
      ),
    })
    .eq("campaign_id", Number(campaignId) || 0)
    .select();

  if (updateError) {
    logger.error("Campaign update error", updateError);
    return json({ success: false, error: updateError }, { headers });
  }
  return json({ success: false, error: updateError }, { headers });
};

export default function ScriptEditor() {
  const {
    workspace_id,
    selected_id,
    script: initScript,
    mediaNames,
    userRole,
    workspace,
  } = useLoaderData<typeof loader>();
  const [isChanged, setChanged] = useState(false);
  const [script, setScript] = useState(initScript);

  const handleSaveUpdate = async () => {
    try {
      const response = await fetch("/api/scripts", {
        method: "PATCH",
        body: JSON.stringify({
          ...script,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }
      setScript(script);
      setChanged(false);
    } catch (error) {
      logger.error("Error saving update:", error);
    }
  };
  const handleReset = () => {
    setScript(initScript);
    setChanged(false);
  };

  type PageData = {
    campaignDetails: { script: Script };
  };

  const handlePageDataChange = (newPageData: PageData) => {
    setScript(newPageData.campaignDetails.script);
    const obj1 = normalizeScriptPageDataForComparison({ campaignDetails: { script } });
    const obj2 = normalizeScriptPageDataForComparison(newPageData);
    setChanged(!deepEqual(obj1, obj2));
  };

  useEffect(() => {
    const obj1 = normalizeScriptForComparison(script);
    const obj2 = normalizeScriptForComparison(initScript);
    setChanged(!deepEqual(obj1, obj2));
  }, [initScript, script]);

  return (
    <div className="relative flex h-full flex-col overflow-visible">
      <SaveBar
        isChanged={isChanged}
        onSave={handleSaveUpdate}
        onReset={handleReset}
      />
      <div className="h-full flex-grow p-4">
        <CampaignSettingsScript
          pageData={{ campaignDetails: { script } } as PageData}
          onPageDataChange={(newData: PageData) => {
            handlePageDataChange(newData);
          }}
          mediaNames={(mediaNames ?? []).map((media) => typeof media === "string" ? media : media.name)}
          scripts={[]}
        />
      </div>
    </div>
  );
}
