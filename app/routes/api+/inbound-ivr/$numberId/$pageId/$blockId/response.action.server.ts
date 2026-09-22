import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { loadInboundIvrBlockContext } from "@/lib/inbound-ivr-db.server";
import { createVoiceResponse, hangupTwiml, type TwimlResponse } from "@/lib/twilio-twiml.server";
import { requireTwilioSignatureForIvrResponse } from "@/lib/ivr-webhook-auth.server";
import { findCallBySid } from "@/lib/telephony-db.server";
import {
  appendInboundVoicemailTwiml,
  resolveInboundVoicemailAudio,
} from "@/lib/inbound-voicemail-twiml.server";
import {
  resolveNoInputTarget,
  type IvrNoInputConfig,
} from "@/lib/ivr-block-runtime.server";
import {
  bumpInboundNoInputReplay,
  inboundNoInputReplayCount,
} from "@/lib/inbound-no-input-replay.server";
import { defineAction } from "@/lib/handler.server";

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, {
    id: string;
    title?: string;
    noInput?: IvrNoInputConfig;
    options?: Array<{ value: string; next?: string }>;
  }>;
}

const findNextBlock = (
  script: Script,
  currentPageId: string,
  currentBlockId: string,
): { pageId: string; blockId: string } | null => {
  const currentPage = script.pages[currentPageId];
  if (!currentPage) return null;
  const currentBlockIndex = currentPage.blocks.indexOf(currentBlockId);

  if (currentBlockIndex < currentPage.blocks.length - 1) {
    const nextBlockId = currentPage.blocks[currentBlockIndex + 1];
    if (!nextBlockId) return null;
    return { pageId: currentPageId, blockId: nextBlockId };
  }

  const pageIds = Object.keys(script.pages);
  const currentPageIndex = pageIds.indexOf(currentPageId);
  if (currentPageIndex < pageIds.length - 1) {
    const nextPageId = pageIds[currentPageIndex + 1];
    const nextPage = nextPageId ? script.pages[nextPageId] : undefined;
    const nextBlockId = nextPage?.blocks[0];
    if (!nextPageId || !nextBlockId) return null;
    return { pageId: nextPageId, blockId: nextBlockId };
  }

  return null;
};

const findNextStep = (
  currentBlock: { id: string; options?: Array<{ value: string; next?: string }> },
  userInput: string | null,
  script: Script,
  pageId: string,
): string => {
  if (currentBlock.options && userInput) {
    const matchedOption = currentBlock.options.find((option) => {
      const optionValue = String(option.value).trim();
      const input = String(userInput).trim();
      return optionValue === input || (input.length > 2 && optionValue === "vx-any");
    });
    if (matchedOption?.next) return matchedOption.next;
  }

  const nextLocation = findNextBlock(script, pageId, currentBlock.id);
  return nextLocation
    ? `${nextLocation.pageId}:${nextLocation.blockId}`
    : "hangup";
};

const renderTerminalTarget = async (
  twiml: TwimlResponse,
  target: string,
  numberId: string,
  workspace: string,
  baseUrl: string,
  script: Script,
) => {
  if (target === "hangup" || target === "end") {
    // Both are terminal (#1884): `end` is the documented terminal target; the
    // old code fell through and redirected to a bogus inbound block URL that
    // played an error before hanging up.
    twiml.hangup();
    return;
  }

  if (target.startsWith("queue:")) {
    const queueId = target.slice(6);
    const enqueue = twiml.enqueue();
    enqueue.queue(`inbound_q_${queueId}`);
    return;
  }

  if (target.startsWith("forward:")) {
    const phoneNumber = target.slice(8);
    twiml.dial().number(phoneNumber);
    return;
  }

  if (target.startsWith("voicemail:")) {
    const voicemail = await resolveInboundVoicemailAudio({
      workspaceId: workspace,
      inboundAudio: null,
    });
    appendInboundVoicemailTwiml({
      twiml,
      phoneNumber: numberId,
      voicemailAudioUrl: voicemail?.signedUrl ?? null,
    });
    return;
  }

  if (target.includes(":")) {
    const [nextPageId, nextBlockId] = target.split(":");
    if (
      nextPageId &&
      nextBlockId &&
      script.pages[nextPageId]?.blocks.includes(nextBlockId)
    ) {
      twiml.redirect(`${baseUrl}/api/inbound-ivr/${numberId}/${nextPageId}/${nextBlockId}/`);
      return;
    }
  }

  if (target.startsWith("page_") && script.pages[target]) {
    twiml.redirect(`${baseUrl}/api/inbound-ivr/${numberId}/${target}/`);
    return;
  }

  // Dangling or malformed target: hang up instead of redirecting into an
  // error prompt. The launch gate (script_routing_invalid) should have blocked
  // this, but never play an error to a caller if one slips through.
  twiml.hangup();
};

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrResponse(request, [params.numberId, params.pageId, params.blockId]),
  sideEffects: ["db-read", "external"],
  handler: async ({ params, auth }) => {
  const baseUrl = env.BASE_URL();
  const twiml = createVoiceResponse();

  const pageId = params.pageId as string;
  const blockId = params.blockId as string;
  const numberId = params.numberId as string;

  const { callSid, userInput } = auth;

  try {
    const call = await findCallBySid(callSid);
    if (!call?.to) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const context = await loadInboundIvrBlockContext(Number(numberId));
    if (!context || call.to !== context.number.phoneNumber) {
      return new Response(hangupTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const { script, number } = context;
    const currentPage = script.pages[pageId];
    const currentBlock = currentPage?.blocks.includes(blockId)
      ? (script.blocks[blockId] as Script["blocks"][string] | undefined)
      : undefined;
    if (!currentBlock) {
      throw new Error(`Block ${blockId} not found`);
    }

    // No-input handling (#1883): mirror the outbound route's noInput branches
    // with a per-call replay counter (no outreach attempt exists inbound).
    const hadInput = userInput != null && String(userInput).trim() !== "";
    const noInputConfig = currentBlock.noInput;
    if (!hadInput && noInputConfig) {
      const replays = inboundNoInputReplayCount(callSid, blockId);
      const target = resolveNoInputTarget(noInputConfig, replays);
      if (target.kind !== "next") {
        if (target.kind === "hangup") {
          twiml.hangup();
        } else if (target.kind === "route") {
          if (script.pages[target.pageId]?.blocks.includes(target.blockId)) {
            twiml.redirect(
              `${baseUrl}/api/inbound-ivr/${numberId}/${target.pageId}/${target.blockId}/`,
            );
          } else {
            twiml.hangup();
          }
        } else if (target.kind === "replay") {
          bumpInboundNoInputReplay(callSid, blockId);
          twiml.redirect(`${baseUrl}/api/inbound-ivr/${numberId}/${pageId}/${blockId}/`);
        }
        return new Response(twiml.toString(), {
          headers: { "Content-Type": "application/xml" },
        });
      }
      // target.kind === "next": fall through to the normal linear flow.
    }

    const nextStep = findNextStep(currentBlock, userInput, script as Script, pageId);
    await renderTerminalTarget(
      twiml,
      nextStep,
      numberId,
      number.workspaceId,
      baseUrl,
      script as Script,
    );
  } catch (e) {
    // Never read raw internal error text aloud to the caller — log it and speak
    // a fixed generic message instead.
    logger.error("Inbound IVR Error:", e);
    twiml.say("Sorry, we ran into a problem. Please try again later. Goodbye.");
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
  },
});
