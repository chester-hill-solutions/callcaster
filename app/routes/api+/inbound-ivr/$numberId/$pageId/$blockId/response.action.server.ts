import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { loadInboundIvrBlockContext } from "@/lib/inbound-ivr-db.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import {
  appendInboundVoicemailTwiml,
  resolveInboundVoicemailAudio,
} from "@/lib/inbound-voicemail-twiml.server";
import Twilio from "twilio";
import type { ActionFunctionArgs } from "react-router";

interface Script {
  pages: Record<string, { blocks: string[] }>;
  blocks: Record<string, {
    id: string;
    title?: string;
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
  twiml: Twilio.twiml.VoiceResponse,
  target: string,
  numberId: string,
  workspace: string,
    baseUrl: string,
) => {
  if (target === "hangup") {
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
    if (nextPageId && nextBlockId) {
      twiml.redirect(`${baseUrl}/api/inbound-ivr/${numberId}/${nextPageId}/${nextBlockId}/`);
      return;
    }
  }

  if (target.startsWith("page_")) {
    twiml.redirect(`${baseUrl}/api/inbound-ivr/${numberId}/${target}/`);
    return;
  }

  twiml.hangup();
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const baseUrl = env.BASE_URL();
  const twiml = new Twilio.twiml.VoiceResponse();

  const pageId = params.pageId;
  const blockId = params.blockId;
  const numberId = params.numberId;

  if (!numberId || !pageId || !blockId) {
    return new Response("Missing required parameters", { status: 400 });
  }

  const formData = await request.formData();
  const formParams = Object.fromEntries(formData.entries()) as Record<string, string>;
  const digitsValue = formParams.Digits;
  const speechResultValue = formParams.SpeechResult;
  const callSidValue = formParams.CallSid;

  const userInput =
    typeof digitsValue === "string"
      ? digitsValue
      : typeof speechResultValue === "string"
        ? speechResultValue
        : null;
  const callSid = typeof callSidValue === "string" ? callSidValue : null;

  if (!callSid) {
    return new Response("Missing CallSid parameter", { status: 400 });
  }

  const validation = await validateTwilioWebhookForCallSid({
    request,
    callSid,
    params: formParams,
  });
  if (!validation.ok) {
    return validation.response;
  }

  try {
    const context = await loadInboundIvrBlockContext(Number(numberId));
    if (!context) {
      throw new Error("Number has no inbound script");
    }

    const { script, number } = context;
    const currentBlock = script.blocks[blockId] as Script["blocks"][string] | undefined;
    if (!currentBlock) {
      throw new Error(`Block ${blockId} not found`);
    }

    const nextStep = findNextStep(currentBlock, userInput, script as Script, pageId);
    await renderTerminalTarget(
      twiml,
      nextStep,
      numberId,
      number.workspaceId,
      baseUrl,
    );
  } catch (e) {
    const errorMessage =
      e instanceof Error ? e.message : "An error occurred. Please try again later.";
    logger.error("Inbound IVR Error:", e);
    twiml.say(errorMessage);
    twiml.hangup();
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "application/xml" },
  });
};
