import type { Script } from "@/lib/types";
import { isObject } from "@/lib/type-safety-utils";

export type CampaignType =
  | "live_call"
  | "message"
  | "robocall"
  | "simple_ivr"
  | "complex_ivr";

export type BaseCampaignDetails = {
  campaign_id: number | null;
  created_at: string;
  id: number;
  script_id: number | null;
  workspace: string;
  script?: Script;
  mediaLinks?: Array<string | { [key: string]: string }>;
  message_media?: string[];
  /** SMS body for message campaigns. Omitting it here made the compose textarea
   *  load blank regardless of the stored value (silent overwrite on save). */
  body_text?: string | null;
  disposition_options?: Record<string, unknown>;
  questions?: Record<string, unknown>;
  voicedrop_audio?: string | null;
};

export type ScriptEditLoaderData = {
  workspace_id: string;
  selected_id: string;
  data: {
    id: number;
    type: CampaignType;
    campaignDetails: BaseCampaignDetails;
  };
  mediaNames: string[];
  userRole: string;
  scripts: Script[];
};

export function getScriptRecordingFileNames(
  script: Script | undefined,
): string[] {
  if (!script?.steps || !isObject(script.steps) || Array.isArray(script.steps)) {
    return [];
  }

  const rawSteps = script.steps as Record<string, unknown>;
  if (!isObject(rawSteps.blocks)) {
    return [];
  }

  return Object.values(rawSteps.blocks).flatMap((block) => {
    if (!isObject(block)) {
      return [];
    }

    const speechType = block.speechType;
    const audioFile = block.audioFile;
    if (
      speechType === "recorded" &&
      typeof audioFile === "string" &&
      audioFile.length > 0
    ) {
      return [audioFile];
    }

    return [];
  });
}
