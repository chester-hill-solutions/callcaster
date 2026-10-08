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
  findNextBlock,
  type IvrScript,
  resolveNoInputTarget,
  type IvrNoInputConfig,
} from "@/lib/ivr-block-runtime.server";
import {
  extractTypedOutreachFields,
  syncContactSupportLevelCache,
} from "@/lib/outreach-typed-fields.server";
import { createTenantDb } from "@/server/tenant-db";

import type { Json } from "@/lib/db-types";
import { findIvrMatchedOption, type IvrOptionLike } from "@/lib/ivr-option-value";
const getOutreach = async (workspaceId: string, outreachId: number) => {
  const row = await findOutreachAttemptById(workspaceId, outreachId);
  if (!row) throw new Error("Outreach attempt not found");
  return row.result;
};

interface Script extends IvrScript {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<
    string,
    {
      id: string;
      title?: string;
      options?: IvrOptionLike[];
      noInput?: IvrNoInputConfig;
    }
  >;
}

const findNextStep = (
  currentBlock: { id: string; options?: IvrOptionLike[] },
  userInput: string | null,
  script: Script,
  pageId: string,
): string => {
  const matchedOption = findIvrMatchedOption(currentBlock.options, userInput);
  if (matchedOption?.next) return matchedOption.next;

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
  if (nextStep === "hangup" || nextStep === "end") {
    // Both are terminal. `end` is the documented terminal target
    // (docs/script-json-format.md); the old code fell through and treated it as
    // a block id, redirecting to a bogus URL that played an error before
    // hanging up.
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
  const twimlResponse = () =>
    new Response(twiml.toString(), {
      headers: { "Content-Type": "application/xml" },
    });

  const pageId = params.pageId as string;
  const blockId = params.blockId as string;
  const campaignId = params.campaignId as string;

  const { callSid, userInput, answer } = auth;

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

    // Replay counts live in the call result so the cap survives the round-trip.
    const hadInput = userInput != null && String(userInput).trim() !== "";
    const matchedOption = findIvrMatchedOption(currentBlock.options, userInput);
    // A gathered key is an answer only when it matches a declared option.
    // Treat an unknown key like no input so it cannot answer a later block.
    const hasAcceptedInput = hadInput && (!currentBlock.options?.length || matchedOption != null);
    const persistResult = async (patch: Record<string, unknown>) => {
      if (call.outreach_attempt_id == null || !call.workspace) return;
      await updateOutreachAttemptForWorkspace(
        call.workspace,
        call.outreach_attempt_id,
        patch,
        { tdb: createTenantDb(call.workspace) },
      );
    };

    let noInputReplays = 0;
    if (currentBlock.noInput) {
      const resultValue =
        call.outreach_attempt_id != null && call.workspace
          ? await getOutreach(call.workspace, call.outreach_attempt_id)
          : null;
      const result =
        resultValue && typeof resultValue === "object"
          ? (resultValue as Record<string, unknown>)
          : {};
      const nested = result.__no_input_replays as
        | Record<string, Record<string, unknown>>
        | undefined;
      const perPage = nested?.[pageId] as Record<string, unknown> | undefined;
      noInputReplays = typeof perPage?.[blockId] === "number" ? (perPage[blockId] as number) : 0;

      if (!hasAcceptedInput) {
        const target = resolveNoInputTarget(currentBlock.noInput, noInputReplays);
        if (target.kind === "hangup") {
          twiml.hangup();
          return twimlResponse();
        }
        if (target.kind === "route") {
          handleNextStep(
            twiml,
            `${target.pageId}:${target.blockId}`,
            campaignId,
            pageId,
            baseUrl,
          );
          return twimlResponse();
        }
        if (target.kind === "replay" && call.outreach_attempt_id != null && call.workspace) {
          await persistResult({
            result: {
              ...result,
              __no_input_replays: {
                ...(nested ?? {}),
                [pageId]: { ...(perPage ?? {}), [blockId]: noInputReplays + 1 },
              },
            },
          });
          twiml.redirect(`${baseUrl}/api/ivr/${campaignId}/${pageId}/${blockId}/`);
          return twimlResponse();
        }
        // replay without a store, or past the cap: fall through.
      }
    }

    // Test calls have no outreach attempt by design: they walk the flow
    // but record nothing, so results, exports, and analytics never see them.
    // Guarding here keeps a test key press from speaking the generic error.
    if (call.outreach_attempt_id && hasAcceptedInput) {
      const resultValue = await getOutreach(call.workspace, call.outreach_attempt_id);
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
          [blockTitle]: answer,
        },
      };

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

  return twimlResponse();
  },
});
