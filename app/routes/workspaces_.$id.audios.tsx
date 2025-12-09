import { LoaderFunctionArgs } from "@remix-run/node";
import { Link, json, useLoaderData } from "@remix-run/react";
import { mediaColumns } from "@/components/file-assets/columns";

import { DataTable } from "@/components/workspace/tables/DataTable";
import { Button } from "@/components/ui/button";
import { getUserRole } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { User } from "@/lib/types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

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

  const userRole = getUserRole({ supabaseClient, user: user as unknown as User, workspaceId });

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
    .list(workspaceId);

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
    if (url) {
      (media as any)["signedUrl"] = url;
    }
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
  const workspaceAudios = audioMedia?.filter((media) => ((!media.name.includes("voicemail-undefined") && !media.name.includes("voicemail-+") && !media.name.includes("recording-"))));
  return (
    <main className="flex h-full flex-col gap-4 rounded-sm ">
      <div className="flex flex-col sm:flex-row sm:justify-between">
        <div className="flex">
          <h1 className="mb-4 text-center font-Zilla-Slab text-2xl font-bold text-brand-primary dark:text-white">
            {workspace != null
              ? `${workspace?.name} Audio Library`
              : "No Workspace"}
          </h1>
        </div>
        <Button asChild className="font-Zilla-Slab text-lg font-semibold">
          <Link to={`./new`}>Add Audio</Link>
        </Button>
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

      {workspaceAudios != null && (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          columns={mediaColumns}
          data={workspaceAudios}
          //   onRowClick={(item) => navigate(`./${item?.id}`)}
        />
      )}
    </main>
  );
}
