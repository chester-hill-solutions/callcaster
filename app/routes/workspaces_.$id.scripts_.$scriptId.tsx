import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import CampaignSettingsScript from "../components/CampaignSettings.Script";
import { deepEqual } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { getUserRole, listMedia } from "~/lib/database.server";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { Script, WorkspaceData } from "~/lib/types";
import { MemberRole } from "~/components/Workspace/TeamMember";

type LoaderDataProps = Promise<{
  workspace: WorkspaceData;
  workspace_id: string;
  selected_id: string;
  script: Script;
  mediaNames: string[];
  userRole: MemberRole;
}>;

export const loader = async ({ request, params }): LoaderDataProps => {
  const { id: workspace_id, scriptId: selected_id } = params;
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspace_id)
    .single();
  if (workspaceError) throw workspaceError;
  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const { data: script } = await supabaseClient
    .from("script")
    .select()
    .eq("workspace", workspace_id)
    .eq("id", selected_id)
    .single();

  const mediaNames = await listMedia(supabaseClient, workspace_id);
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

export const action = async ({ request, params }) => {
  const campaignId = params.selected_id;
  const formData = await request.formData();
  const mediaName = formData.get("fileName");
  const encodedMediaName = encodeURI(mediaName);

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const { data: campaign, error } = await supabaseClient
    .from("message_campaign")
    .select("id, message_media")
    .eq("campaign_id", campaignId)
    .single();
  if (error) {
    console.log("Campaign Error", error);
    return json({ success: false, error: error }, { headers });
  }
  const { data: campaignUpdate, error: updateError } = await supabaseClient
    .from("message_campaign")
    .update({
      message_media: campaign.message_media.filter(
        (med) => med !== encodedMediaName,
      ),
    })
    .eq("campaign_id", campaignId)
    .select();

  if (updateError) {
    console.log(updateError);
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
      console.error("Error saving update:", error);
    }
  };
  const handleReset = () => {
    setScript(initScript);
    setChanged(false);
  };

  const handlePageDataChange = (newPageData) => {
    setScript(newPageData.campaignDetails.script);
    const obj1 = script;
    const obj2 = newPageData;
    delete obj1.campaignDetails?.script?.updated_at;
    delete obj2.campaignDetails?.script?.updated_at;
    setChanged(!deepEqual(obj1, obj2));
  };

  useEffect(() => {
    const obj1 = script;
    const obj2 = initScript;
    delete obj1.updated_at;
    delete obj2.updated_at;
    setChanged(!deepEqual(obj1, obj2));
  }, [initScript, script]);

  return (
    <div className="relative flex h-full flex-col overflow-visible">
      {isChanged && (
        <div className="fixed left-0 right-0 top-0 z-50 flex flex-col items-center justify-between bg-primary px-4 py-3 text-white shadow-md sm:flex-row sm:px-6 sm:py-5">
          <Button
            onClick={handleReset}
            className="mb-2 w-full rounded bg-white px-4 py-2 text-gray-500 transition-colors hover:bg-red-100 sm:mb-0 sm:w-auto"
          >
            Reset
          </Button>
          <div className="mb-2 text-center text-lg font-semibold sm:mb-0 sm:text-left">
            You have unsaved changes
          </div>
          <Button
            onClick={() => handleSaveUpdate(true)}
            className="w-full rounded bg-secondary px-4 py-2 text-black transition-colors hover:bg-white sm:w-auto"
          >
            Save Changes
          </Button>
        </div>
      )}
      <div className="h-full flex-grow p-4">
        <CampaignSettingsScript
          pageData={{ campaignDetails: { script } }}
          onPageDataChange={(newData) => {
            handlePageDataChange(newData);
          }}
          mediaNames={mediaNames}
          scripts={[]}
        />
      </div>
    </div>
  );
}
