import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logger.server";

export function getRecordingFileNames(stepData: unknown) {
  if (!Array.isArray(stepData)) {
    logger.warn("stepData is not an array");
    return [];
  }

  return stepData.reduce((fileNames: string[], step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      return fileNames;
    }

    const typedStep = step as { speechType?: string; say?: string };
    if (
      typedStep.speechType === "recorded" &&
      typedStep.say &&
      typedStep.say !== "Enter your question here"
    ) {
      fileNames.push(typedStep.say);
    }
    return fileNames;
  }, []);
}

export async function getMedia(
  fileNames: Array<string>,
  supabaseClient: SupabaseClient,
  workspace_id: string,
) {
  const media = await Promise.all(
    fileNames.map(async (mediaName) => {
      const { data, error } = await supabaseClient.storage
        .from("workspaceAudio")
        .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
      if (error) throw error;
      return { [mediaName]: data.signedUrl };
    }),
  );

  return media;
}

export async function listMedia(
  supabaseClient: SupabaseClient,
  workspace: string,
) {
  const { data, error } = await supabaseClient.storage
    .from(`workspaceAudio`)
    .list(workspace);
  if (error) logger.error("Error listing workspace media", error);
  return data;
}

export async function getSignedUrls(
  supabaseClient: SupabaseClient,
  workspace_id: string,
  mediaNames: string[],
) {
  return Promise.all(
    mediaNames.map(async (mediaName) => {
      const { data, error } = await supabaseClient.storage
        .from("messageMedia")
        .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
      if (error) throw error;
      return data.signedUrl;
    }),
  );
}
