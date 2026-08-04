import { logger } from "../logger.server";
import {
  createSignedObjectUrl,
  listObjects,
} from "@/lib/object-storage.server";

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
  workspace_id: string,
) {
  const media = await Promise.all(
    fileNames.map(async (mediaName) => {
      const signedUrl = await createSignedObjectUrl(
        "workspaceAudio",
        `${workspace_id}/${mediaName}`,
        3600,
      );
      return { [mediaName]: signedUrl };
    }),
  );

  return media;
}

export async function listMedia(workspace: string) {
  try {
    return await listObjects("workspaceAudio", workspace, {
      sortBy: { column: "created_at", order: "desc" },
    });
  } catch (error) {
    logger.error("Error listing workspace media", error);
    return null;
  }
}

export async function getSignedUrls(
  workspace_id: string,
  mediaNames: string[],
) {
  return Promise.all(
    mediaNames.map(async (mediaName) =>
      createSignedObjectUrl(
        "messageMedia",
        `${workspace_id}/${mediaName}`,
        3600,
      ),
    ),
  );
}
