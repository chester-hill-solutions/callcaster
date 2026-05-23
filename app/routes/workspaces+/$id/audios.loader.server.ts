import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { User } from "@/lib/types";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return routeData(
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
    return routeData(
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
    logger.warn("Media Error:", mediaError);
    return routeData(
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
    logger.debug("No workspace folder exists");
    return routeData(
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
    logger.warn("SignedUrls Error:", signedUrlsError);
    return routeData({
      audioMedia: null,
      workspace: workspaceData,
      error: signedUrlsError.message,
      userRole,
    });
  }

  const mediaWithSignedUrls = mediaData.map((media) => {
    const signedUrl = signedUrls.find(
      (mediaUrl) => mediaUrl.path === `${workspaceId}/${media.name}`,
    )?.signedUrl;

    return signedUrl ? { ...media, signedUrl } : media;
  });

  return routeData(
    { audioMedia: mediaWithSignedUrls, workspace: workspaceData, error: null, userRole },
    { headers },
  );
}
