import { Block, Flow, IVRBlock, Script } from "@/lib/types";
import { isObject, isString } from "@/lib/type-safety-utils";

const DEFAULT_SECTION_TITLES = ["Start Here", "Main Questions", "Wrap Up"];

export function getDefaultSectionTitle(sectionNumber: number): string {
  return (
    DEFAULT_SECTION_TITLES[sectionNumber - 1] ?? `Section ${sectionNumber}`
  );
}

export function getFlowType(script: Script): Flow["type"] {
  if (script.type === "inbound_ivr") return "inbound_ivr";
  return script.type === "ivr" ? "ivr" : "script";
}

export function createEmptyFlow(type: Flow["type"]): Flow {
  return {
    type,
    pages: {},
    blocks: {},
    startPage: "",
  };
}

export function createDefaultBlock(
  id: string,
  flowType: Flow["type"],
  options?: {
    isFirstInSection?: boolean;
    sectionTitle?: string;
  },
): Block | IVRBlock {
  const isFirstInSection = options?.isFirstInSection ?? false;
  const sectionTitle = options?.sectionTitle?.trim() || "this section";

  const baseBlock: Block = {
    id,
    type: "textarea",
    title: isFirstInSection ? `Open ${sectionTitle}` : "",
    content: isFirstInSection
      ? "Introduce the purpose of this section, then ask the first question."
      : "",
    options: [],
  };

  if (flowType === "ivr" || flowType === "inbound_ivr") {
    return {
      ...baseBlock,
      title: isFirstInSection ? "Welcome Message" : baseBlock.title,
      audioFile: isFirstInSection
        ? "Hello, thanks for taking this call. Please listen to the following question."
        : "",
      speechType: "synthetic",
      responseType: isFirstInSection
        ? flowType === "inbound_ivr"
          ? "dtmf"
          : "speech"
        : null,
    };
  }

  return baseBlock;
}

export function normalizeFlow(script: Script): Flow {
  const flowType = getFlowType(script);
  if (!isObject(script.steps)) {
    return createEmptyFlow(flowType);
  }

  const raw = script.steps as Record<string, unknown>;
  const pages = isObject(raw.pages) ? (raw.pages as Flow["pages"]) : {};
  const blocks = isObject(raw.blocks) ? (raw.blocks as Flow["blocks"]) : {};
  const firstPageId = Object.keys(pages)[0] ?? "";

  return {
    type:
      raw.type === "ivr" ? "ivr" : raw.type === "inbound_ivr" ? "inbound_ivr" : raw.type === "script" ? "script" : flowType,
    pages,
    blocks,
    startPage: isString(raw.startPage) ? raw.startPage : firstPageId,
  };
}

export type ScriptData = Flow;
