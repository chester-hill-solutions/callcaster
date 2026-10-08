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
  findNextBlock,
  type IvrScript,
  resolveNoInputTarget,
  type IvrNoInputConfig,
  type NoInputTarget,
} from "@/lib/ivr-block-runtime.server";
import {
  bumpInboundNoInputReplay,
  inboundNoInputReplayCount,
} from "@/lib/inbound-no-input-replay.server";
import { defineAction } from "@/lib/handler.server";
import { findIvrMatchedOption, type IvrOptionLike } from "@/lib/ivr-option-value";
import { appendInboundQueueTwiml } from "@/lib/inbound-queue-twiml.server";
import { parseInboundTerminalTarget } from "@/lib/ivr-script-validation";
import { bindInboundVoicemailRecipient } from "@/server/inbound-voicemail-store.server";

interface Script extends IvrScript {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, {
    id: string;
    title?: string;
    noInput?: IvrNoInputConfig;
    options?: IvrOptionLike[];
  }>;
}

const findNextStep = (
  currentBlock: { id: string; options?: IvrOptionLike[] },
  userInput: string | null,
  script: Script,
  pageId: string,
): string => {
  if (currentBlock.options && userInput) {
    const matchedOption = findIvrMatchedOption(currentBlock.options, String(userInput));
    if (matchedOption?.next) return matchedOption.next;
  }

  const nextLocation = findNextBlock(script, pageId, currentBlock.id);
  return nextLocation
    ? `${nextLocation.pageId}:${nextLocation.blockId}`
    : "hangup";
};

const renderTerminalTarget = async (
  options: {
    twiml: TwimlResponse;
    target: string;
    numberId: string;
    workspace: string;
    inboundAudio: string | null;
    phoneNumber: string;
    callSid: string;
    callerNumber: string;
    baseUrl: string;
    script: Script;
  },
) => {
  const { twiml, target, numberId, workspace, inboundAudio, phoneNumber, baseUrl, script } = options;
  if (target === "hangup" || target === "end") {
    // Both are terminal (#1884): `end` is the documented terminal target; the
    // old code fell through and redirected to a bogus inbound block URL that
    // played an error before hanging up.
    twiml.hangup();
    return;
  }

  if (target.startsWith("queue:")) {
    await appendInboundQueueTwiml({
      twiml, workspaceId: workspace, queueId: /^\d+$/.test(target.slice(6)) ? Number(target.slice(6)) : NaN,
      callSid: options.callSid, callerNumber: options.callerNumber, baseUrl,
    });
    return;
  }

  if (target.startsWith("forward:")) {
    const phoneNumber = target.slice(8);
    twiml.dial().number(phoneNumber);
    return;
  }

  if (target.startsWith("voicemail:")) {
    const terminal = parseInboundTerminalTarget(target);
    if (terminal?.kind !== "voicemail") { twiml.hangup(); return; }
    await bindInboundVoicemailRecipient({ workspaceId: workspace, callSid: options.callSid, phoneNumber }, terminal.email);
    const voicemail = await resolveInboundVoicemailAudio({
      workspaceId: workspace,
      inboundAudio,
    });
    appendInboundVoicemailTwiml({
      twiml,
      phoneNumber,
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

  if (script.pages[target]) {
    twiml.redirect(`${baseUrl}/api/inbound-ivr/${numberId}/${target}/`);
    return;
  }

  // Dangling or malformed target: hang up instead of redirecting into an
  // error prompt. The launch gate (script_routing_invalid) should have blocked
  // this, but never play an error to a caller if one slips through.
  twiml.hangup();
};

/**
 * No-input branch (#1883): mirror the outbound route (hangup / route / replay
 * with a per-call cap). Returns true when the branch produced TwiML and the
 * handler should return early; false for `next`, meaning the caller falls
 * through to the standard linear flow.
 */
const renderInboundNoInputBranch = (
  twiml: TwimlResponse,
  options: {
    target: NoInputTarget;
    numberId: string;
    pageId: string;
    blockId: string;
    callSid: string;
    baseUrl: string;
    script: Script;
  },
): boolean => {
  const { target, numberId, pageId, blockId, callSid, baseUrl, script } = options;
  if (target.kind === "next") {
    return false;
  }
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
  return true;
};

export const action = defineAction({
  auth: ({ request, params }) =>
    requireTwilioSignatureForIvrResponse(request, [params.numberId, params.pageId, params.blockId]),
  sideEffects: ["db-read", "db-write", "external"],
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
    if (!context || call.to !== context.number.phoneNumber || call.workspace !== context.number.workspaceId) {
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
    if (!hadInput && currentBlock.noInput) {
      const target = resolveNoInputTarget(
        currentBlock.noInput,
        inboundNoInputReplayCount(callSid, blockId),
      );
      const handled = renderInboundNoInputBranch(twiml, {
        target,
        numberId,
        pageId,
        blockId,
        callSid,
        baseUrl,
        script: script as Script,
      });
      if (handled) {
        return new Response(twiml.toString(), {
          headers: { "Content-Type": "application/xml" },
        });
      }
      // target.kind === "next": fall through to the normal linear flow.
    }

    const nextStep = findNextStep(currentBlock, userInput, script as Script, pageId);
    await renderTerminalTarget({
      twiml,
      target: nextStep,
      numberId,
      workspace: number.workspaceId,
      inboundAudio: number.inbound_audio ?? null,
      phoneNumber: call.to,
      callSid,
      callerNumber: call.from ?? "",
      baseUrl,
      script: script as Script,
    });
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
