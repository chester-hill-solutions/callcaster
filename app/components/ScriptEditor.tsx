import { useState, useEffect } from 'react';
import { useLoaderData } from "@remix-run/react";
import { deepEqual } from "~/lib/utils";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { EditorHeader } from './ScriptEditHeader';
import { SaveDialog } from './SaveDialog';
import { ScriptEditorContent } from './ScriptEditorContent';
import { json, redirect } from "@remix-run/node";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { getUserRole, listMedia } from "~/lib/database.server";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, scriptId: selected_id } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspace_id)
    .single();

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const {data: script} = await supabaseClient
    .from("script")
    .select()
    .eq("id", selected_id)
    .single();
  const mediaNames = await listMedia(supabaseClient, workspace_id);

  return json({
    workspace,
    workspace_id,
    selected_id,
    data: { type: "standalone_script", campaignDetails: { script } },
    mediaNames,
    userRole,
    scripts: [],
  });
};

export default function ScriptEditor() {
  const { workspace, workspace_id, selected_id, data: initData, mediaNames, userRole } = useLoaderData();
  const [pageData, setPageData] = useState(initData);
  const [isChanged, setChanged] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const handleSaveUpdate = async (saveScriptAsCopy = false) => {
    try {
      const response = await fetch("/api/scripts", {
        method: "PATCH",
        body: JSON.stringify({
          scriptData: pageData.campaignDetails.script,
          saveScriptAsCopy
        }),
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }
      setPageData({ ...pageData, campaignDetails: { script: result.data } });
      setChanged(false);
      setShowSaveModal(false);
    } catch (error) {
      console.error("Error saving update:", error);
    }
  };

  const handleReset = () => {
    setPageData(initData);
    setChanged(false);
  };

  const handlePageDataChange = (newPageData) => {
    setPageData(newPageData);
    let obj1 = initData;
    let obj2 = newPageData;
    delete obj1.campaignDetails?.script?.updated_at;
    delete obj2.campaignDetails?.script?.updated_at;
    setChanged(!deepEqual(obj1, obj2));
  };

  useEffect(() => {
    let obj1 = initData;
    let obj2 = pageData;
    delete obj1.campaignDetails?.script?.updated_at;
    delete obj2.campaignDetails?.script?.updated_at;
    setChanged(!deepEqual(obj1, obj2));
  }, [initData, pageData]);

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm">
      <WorkspaceNav workspace={workspace} userRole={userRole} />

      <div className="relative flex h-full flex-col overflow-visible">
        {isChanged && (
          <EditorHeader
            isChanged={isChanged}
            onReset={handleReset}
            onSave={() => setShowSaveModal(true)}
          />
        )}
        <div className="flex-grow p-4 h-full">
          <ScriptEditorContent
            pageData={pageData}
            onPageDataChange={handlePageDataChange}
            scripts={[]}
            mediaNames={mediaNames}
            workspace_id={workspace_id}
            selected_id={selected_id}
          />
        </div>
      </div>
      <SaveDialog
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={() => handleSaveUpdate(false)}
        onSaveAsCopy={() => handleSaveUpdate(true)}
        scriptName={pageData.campaignDetails?.script?.name}
      />
    </main>
  );
}