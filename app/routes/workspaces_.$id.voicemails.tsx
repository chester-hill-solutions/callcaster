import { LoaderFunctionArgs } from "@remix-run/node";
import { redirect, useLoaderData, useOutletContext } from "@remix-run/react";
import { mediaColumns } from "~/components/Media/columns";

import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { getUserRole } from "~/lib/database.server";
import { verifyAuth } from "~/lib/supabase.server";
import { Workspace, User } from "~/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (!workspaceId) {
   return redirect("/workspaces") 
  }

  const userRole = await getUserRole({ supabaseClient: supabaseClient as SupabaseClient, user: user as unknown as User, workspaceId: workspaceId as string });
  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspaceId, { sortBy: { column: 'created_at', order: 'desc' } });

  if (mediaError) {
    console.log("Media Error: ", mediaError);
    return {
      audioMedia: null,
      error: mediaError.message,
    }
  }
  if (mediaData.length === 0) {
    console.log("No workspace folder exists");
    return {
      audioMedia: null,
      error: "No Audio in Workspace",
    };
  }

  const mediaPaths = mediaData.map((media) => `${workspaceId}/${media.name}`);
  const { data: signedUrls, error: signedUrlsError } =
    await supabaseClient.storage
      .from("workspaceAudio")
      .createSignedUrls(mediaPaths, 3600);

  if (signedUrlsError) {
    return {
      audioMedia: null,
      error: signedUrlsError.message,
    };
  }

  for (let media of mediaData) {
    const url = signedUrls.find(
      (mediaUrl) => mediaUrl.path === `${workspaceId}/${media.name}`,
    )?.signedUrl;
    if (url) {
      media["signedUrl"] = url;
    }
  }

  return { audioMedia: mediaData, error: null };
}

export default function WorkspaceAudio() {
  const { audioMedia, error} =
    useLoaderData<typeof loader>();
  const {workspace } = useOutletContext<{workspace: Workspace}>();
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
