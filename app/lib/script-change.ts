import type { Script } from "@/lib/types";

type ScriptPageData = {
  campaignDetails?: {
    script?: Script | null;
  };
};

export function normalizeScriptForComparison<T extends Script | null | undefined>(
  script: T,
): T {
  if (!script) {
    return script;
  }

  return {
    ...script,
    updated_at: null,
  } as T;
}

export function normalizeScriptPageDataForComparison<T extends ScriptPageData>(
  pageData: T,
): T {
  if (!pageData.campaignDetails?.script) {
    return pageData;
  }

  return {
    ...pageData,
    campaignDetails: {
      ...pageData.campaignDetails,
      script: normalizeScriptForComparison(pageData.campaignDetails.script),
    },
  };
}
