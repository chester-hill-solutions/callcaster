import { fetchCampaignWithScript, ivrScriptStepsFromCampaign } from "@/lib/campaign-ivr.server";
import {
  findCallBySid,
  findOutreachAttemptById,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { createVoiceResponse, hangupTwiml, type TwimlResponse } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrResponse } from "@/lib/ivr-webhook-auth.server";
import { defineAction } from "@/lib/handler.server";
import {
  extractTypedOutreachFields,
  syncContactSupportLevelCache,
} from "@/lib/outreach-typed-fields.server";
import { createTenantDb } from "@/server/tenant-db";

import type { Json } from "@/lib/db-types";
const getOutreach = async (workspaceId: string, outreachId: number) => {
  const row = await findOutreachAttemptById(workspaceId, outreachId);
  if (!row) throw new Error("Outreach attempt not found");
  return row.result;
};

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<
    string,
    { id: string; title?: string; options?: Array<{ value: string; next?: string }> }
  >;
}

const findNextBlock = (script: Script, currentPageId: string, currentBlockId: string): { pageId: string; blockId: string } | null => {
  const currentPage = script.pages[currentPageId];
  if (!currentPage) {
    return null;
  }
  const currentBlockIndex = currentPage.blocks.indexOf(currentBlockId);

  if (currentBlockIndex < currentPage.blocks.length - 1) {
    const nextBlockId = currentPage.blocks[currentBlockIndex + 1];
    if (!nextBlockId) {
      return null;
    }
    return {
      pageId: currentPageId,
      blockId: nextBlockId,
    };
  }

  const pageIds = Object.keys(script.pages);
  const currentPageIndex = pageIds.indexOf(currentPageId);
  if (currentPageIndex < pageIds.length - 1) {
    const nextPageId = pageIds[currentPageIndex + 1];
    const nextPage = nextPageId ? script.pages[nextPageId] : undefined;
    const nextBlockId = nextPage?.blocks[0];
    if (!nextPageId || !nextBlockId) {
      return null;
    }
    return { pageId: nextPageId, blockId: nextBlockId };
  }

  return null;
};

const findNextStep = (currentBlock: { id: string; options?: Array<{ value: string; next?: string }> }, userInput: string | null, script: Script, pageId: string): string => {
  const hasUserInput = userInput != null && String(userInput).trim() !== "";
  if (currentBlock.options && hasUserInput) {
    const matchedOption = currentBlock.options.find((option) => {
      const optionValue = String(option.value).trim();
      const input = String(userInput).trim();
      return optionValue === input || (input.length > 2 && optionValue === 'vx-any');
    });
    if (matchedOption && matchedOption.next) return matchedOption.next;
  }

  const nextLocation = findNextBlock(script, pageId, currentBlock.id);
  return nextLocation 
    ? `${nextLocation.pageId}:${nextLocation.blockId}`
    : 'hangup';
};

const handleNextStep = (
  twiml: TwimlResponse,
  nextStep: string,
  campaignId: string,
  pageId: string,
  baseUrl: string,
) => {
  if (nextStep === "hangup") {
    twiml.hangup();
  } else if (nextStep.includes(":")) {
    const [nextPageId, nextBlockId] = nextStep.split(":");
    if (!nextPageId || !nextBlockId) {
      twiml.hangup();
      return;
    }
    twiml.redirect(
      `${baseUrl}/api/ivr/${campaignId}/${nextPageId}/${nextBlockId}/`
    );
  } else if (nextStep.startsWith("page_")) {
    twiml.redirect(
      `${baseUrl}/api/ivr/${campaignId}/${nextStep}/`
    );
  } else {
    twiml.redirect(
      `${baseUrl}/api/ivr/${campaignId}/${pageId}/${nextStep}/`
    );
  }
};

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrResponse(request, [params.campaignId, params.pageId, params.blockId]),
  sideEffects: ["db-write"],
  handler: async ({ params, auth }) => {
  const baseUrl = env.BASE_URL();

  const twiml = createVoiceResponse();

  const pageId = params.pageId as string;
  const blockId = params.blockId as string;
  const campaignId = params.campaignId as string;

  const { callSid, userInput } = auth;

  try {
    const [call, campaignData] = await Promise.all([
      findCallBySid(callSid),
      fetchCampaignWithScript(campaignId),
    ]);

    if (!call?.workspace) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }
    if (call.campaign_id !== Number(campaignId)) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const stepsValue = ivrScriptStepsFromCampaign(campaignData);
    if (!stepsValue) {
      throw new Error("Script steps not found");
    }

    const script = stepsValue as unknown as Script;
    if (!script || !script.blocks || !script.pages) {
      throw new Error("Invalid script structure");
    }
    const currentPage = script.pages[pageId];
    const currentBlock = currentPage?.blocks.includes(blockId)
      ? script.blocks[blockId]
      : undefined;
    if (!currentBlock) {
      throw new Error(`Block ${blockId} not found`);
    }

    const resultValue = await getOutreach(call.workspace, call.outreach_attempt_id ?? 0);
    const result =
      resultValue && typeof resultValue === "object"
        ? (resultValue as Record<string, unknown>)
        : {};

    const blockTitle =
      "title" in currentBlock && typeof currentBlock.title === "string"
        ? currentBlock.title
        : blockId;

    const newResult = {
      ...result,
      [pageId]: {
        ...(result[pageId] && typeof result[pageId] === "object"
          ? (result[pageId] as Record<string, unknown>)
          : {}),
        [blockTitle]: userInput,
      },
    };

    if (!call.outreach_attempt_id) {
      throw new Error("Missing outreach attempt for IVR response");
    }
    const typedFields = extractTypedOutreachFields(newResult as Json);
    const tdb = createTenantDb(call.workspace);
    const outreachUpdate = await updateOutreachAttemptForWorkspace(
      call.workspace,
      call.outreach_attempt_id,
      { result: newResult, ...typedFields },
      { tdb },
    );
    if (outreachUpdate instanceof Response) {
      throw new Error(await outreachUpdate.text());
    }

    if (call.contact_id != null && typedFields.support_level != null) {
      await syncContactSupportLevelCache(tdb, call.contact_id, typedFields.support_level);
    }

    const nextStep = findNextStep(currentBlock, userInput, script, pageId);
    handleNextStep(twiml, nextStep, campaignId, pageId, baseUrl);
  } catch (e) {
    // Never read raw internal error text aloud to the caller — log it and speak
    // a fixed generic message instead.
    logger.error("IVR Error:", e);
    twiml.say("Sorry, we ran into a problem. Please try again later. Goodbye.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
  },
});
