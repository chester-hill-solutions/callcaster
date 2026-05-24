import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { Workspace } from "@/lib/types";
import type { FileObject } from "@supabase/storage-js";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params["id"];
  if (!workspaceId) {
   return redirect("/workspaces") 
  }

  const userRole = await getUserRole({ supabaseClient, user, workspaceId });
  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspaceId, { sortBy: { column: 'created_at', order: 'desc' } });

  if (mediaError) {
    logger.error("Media Error: ", mediaError);
    return {
      audioMedia: null,
      error: mediaError.message,
    }
  }
  if (mediaData.length === 0) {
    logger.debug("No workspace folder exists");
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

  // augment each media entry with a signedUrl in a type-safe way
  const mediaWithUrls = mediaData.map((m) => {
    const found = signedUrls.find((u) => u.path === `${workspaceId}/${m.name}`);
    return { ...m, signedUrl: found?.signedUrl } as typeof m & { signedUrl?: string };
  });

  return { audioMedia: mediaWithUrls, error: null };
}
