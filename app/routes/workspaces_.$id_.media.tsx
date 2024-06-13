import { LoaderFunctionArgs } from "@remix-run/node";
import { Link, json, useLoaderData } from "@remix-run/react";
import { mediaColumns } from "~/components/Media/columns";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      { audioMedia: null, workspace: null, error: "Workspace does not exist" },
      { headers },
    );
  }

  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();
  if (workspaceError) {
    return json(
      { audioMedia: null, workspace: null, error: workspaceError.message },
      { headers },
    );
  }

  //   Getting All Buckets
  //   const { data, error } = await supabaseClient.storage.listBuckets();
  //   console.log("Buckets: ", data, error);

  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspaceId);

  if (mediaError) {
    console.log("Media Error: ", mediaError);
    return json(
      { audioMedia: null, workspace: workspaceData, error: mediaError.message },
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
      },
      { headers },
    );
  }
  // console.log("Media Data: ", mediaData);

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
    });
  }

  for (const media of mediaData) {
    const url = signedUrls.find(
      (mediaUrl) => mediaUrl.path === `${workspaceId}/${media.name}`,
    ).signedUrl;
    // console.log(`${media.name}: ${url}`);
    media["signedUrl"] = url;
  }

  return json(
    { audioMedia: mediaData, workspace: workspaceData, error: null },
    { headers },
  );
}

// export async function action({ request, params }: ActionFunctionArgs) {
//   const { supabaseClient, headers, serverSession } =
//     await getSupabaseServerClientWithSession(request);

//   return json({}, { headers });
// }

export default function WorkspaceMedia() {
  const { audioMedia, workspace, error } = useLoaderData<typeof loader>();
  //   const actionData = useActionData<typeof action>();

  const isWorkspaceAudioEmpty = error === "No Audio in Workspace";

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {workspace != null ? `${workspace?.name} Media` : "No Workspace"}
        </h1>
        <div className="flex items-center gap-4">
          <Button asChild className="font-Zilla-Slab text-xl font-semibold">
            <Link to={`./new`}>Add Media</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-0 border-black bg-zinc-600 font-Zilla-Slab text-xl font-semibold text-white hover:bg-zinc-300 dark:border-white"
          >
            <Link to=".." relative="path">
              Back
            </Link>
          </Button>
        </div>
      </div>
      {error && !isWorkspaceAudioEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}
      {isWorkspaceAudioEmpty && (
        <h4 className="py-16 text-center font-Zilla-Slab text-4xl font-bold text-black dark:text-white">
          Add Your Own Media to this Workspace!
        </h4>
      )}

      {audioMedia != null && (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          columns={mediaColumns}
          data={audioMedia}
          //   onRowClick={(item) => navigate(`./${item?.id}`)}
        />
      )}
    </main>
  );
}
