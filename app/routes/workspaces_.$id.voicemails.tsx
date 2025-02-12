import { LoaderFunctionArgs } from "@remix-run/node";
import { Link, json, useLoaderData } from "@remix-run/react";
import { mediaColumns } from "~/components/Media/columns";

import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      {
        audioMedia: null,
        workspace: null,
        error: "Workspace does not exist",
        userRole: null,
      },
      { headers },
    );
  }

  const userRole = getUserRole({ serverSession, workspaceId });

  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();
  if (workspaceError) {
    return json(
      {
        audioMedia: null,
        workspace: null,
        error: workspaceError.message,
        userRole,
      },
      { headers },
    );
  }


  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspaceId, { sortBy: { column: 'created_at', order: 'desc' } });
  
    if (mediaError) {
    console.log("Media Error: ", mediaError);
    return json(
      {
        audioMedia: null,
        workspace: workspaceData,
        error: mediaError.message,
        userRole,
      },
      { headers },
    );
  }

  if (mediaData.length === 0) {
    console.log("No workspace folder exists");
    return json(
      {
        audioMedia: null,
        workspace: workspaceData,
        error: "No Audio in Workspace",
        userRole,
      },
      { headers },
    );
  }
  
  const mediaPaths = mediaData.map((media) => `${workspaceId}/${media.name}`);
  const { data: signedUrls, error: signedUrlsError } =
    await supabaseClient.storage
      .from("workspaceAudio")
      .createSignedUrls(mediaPaths, 60);

  if (signedUrlsError) {
    console.log("SignedUrls Error: ", signedUrlsError);
    return json({
      audioMedia: null,
      workspace: workspaceData,
      error: signedUrlsError.message,
      userRole,
    });
  }

  for (const media of mediaData) {
    const url = signedUrls.find(
      (mediaUrl) => mediaUrl.path === `${workspaceId}/${media.name}`,
    )?.signedUrl;
    media["signedUrl"] = url;
  }

  return json(
    { audioMedia: mediaData, workspace: workspaceData, error: null, userRole },
    { headers },
  );
}

export default function WorkspaceAudio() {
  const { audioMedia, workspace, error, userRole } =
    useLoaderData<typeof loader>();

  const isWorkspaceAudioEmpty = error === "No Audio in Workspace";
  const voicemails = audioMedia?.filter((media) => media.name.includes("voicemail-+" || "voicemail-undefined"));
  
  return (
    <main className="flex h-full flex-col gap-4 rounded-sm ">
      <div className="flex flex-col sm:flex-row sm:justify-between">
        <div className="flex">
          <h1 className="mb-4 text-center font-Zilla-Slab text-2xl font-bold text-brand-primary dark:text-white">
            {workspace != null
              ? `${workspace?.name} Voicemails`
              : "No Workspace"}
          </h1>
        </div>
      </div>
      {error && !isWorkspaceAudioEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}
      {isWorkspaceAudioEmpty && (
        <h4 className="py-16 text-center font-Zilla-Slab text-2xl font-bold text-black dark:text-white">
          Add Your Own Audio to this Workspace!
        </h4>
      )}
      {voicemails != null && (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          columns={mediaColumns}
          data={voicemails}
        />
      )}
    </main>
  );
}
