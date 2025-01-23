import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import { validateRequest } from "npm:twilio@^5.3.0/lib/webhooks/webhooks.js";

import { SupabaseClient } from "@supabase/supabase-js";
interface TwilioEventData {
  CallSid?: string;
  RecordingUrl?: string;
  Digits?: string;
  SpeechResult?: string;
  AnsweredBy?: string;
}

const log = (level: string, message: string, data = {}) => {
  console[level](`[${new Date().toISOString()}] ${message}`, JSON.stringify(data));
};

const baseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
const getCallWithRetry = async (supabase: SupabaseClient, callSid: string, retries = 0) => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 200;

  const { data, error } = await supabase
    .from("call")
    .select('*, outreach_attempt(id, result, current_step), campaign(*,ivr_campaign(*, script(*)))')
    .eq("sid", callSid)
    .single();

  if (error || !data) {
    log('warn', `Failed to retrieve call data`, { callSid, error, retryAttempt: retries });
    if (retries < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return getCallWithRetry(supabase, callSid, retries + 1);
    }
    throw new Error("Failed to retrieve call after multiple attempts");
  }
  return data;
};

const findNextStep = (currentBlock, userInput, script, pageId) => {
  if (currentBlock.options && currentBlock.options.length > 0) {
    // First try to find an exact match
    const exactMatch = currentBlock.options.find((option) => {
      const optionValue = String(option.value).trim();
      const input = userInput !== undefined ? String(userInput).trim() : '';
      return optionValue === input;
    });
    
    if (exactMatch) {
      if (exactMatch.next) {
        return exactMatch.next;
      }
    }

    // If no exact match, try vx-any
    const anyMatch = currentBlock.options.find((option) => {
      const optionValue = String(option.value).trim();
      const input = userInput !== undefined ? String(userInput).trim() : '';
      return input.length > 0 && optionValue === 'vx-any';
    });

    if (anyMatch && anyMatch.next) {
      return anyMatch.next;
    }
  }

  const nextBlock = findNextBlock(script, pageId, currentBlock.id);
  if (nextBlock) {
    return `${nextBlock.pageId}:${nextBlock.blockId}`;
  }
  return 'hangup';
};

const findNextBlock = (script: any, currentPageId: string, currentBlockId: string) => {
  const currentPage = script.pages[currentPageId];
  const currentBlockIndex = currentPage.blocks.indexOf(currentBlockId);
  if (currentBlockIndex < currentPage.blocks.length - 1) {
    return {
      pageId: currentPageId,
      blockId: currentPage.blocks[currentBlockIndex + 1],
    };
  }

  const pageIds = Object.keys(script.pages);
  const currentPageIndex = pageIds.indexOf(currentPageId);
  if (currentPageIndex < pageIds.length - 1) {
    const nextPageId = pageIds[currentPageIndex + 1];
    return {
      pageId: nextPageId,
      blockId: script.pages[nextPageId].blocks[0]
    };
  }

  return null;
};

const handleVMAudio = async (supabase, campaign, workspace) => {
  const { voicemail_file } = campaign;
  if (!voicemail_file) return null;

  try {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("workspaceAudio")
      .createSignedUrl(`${workspace}/${voicemail_file}`, 3600);

    if (signedUrlError) throw signedUrlError;
    return { signedUrl: signedUrlData.signedUrl };
  } catch (error) {
    log('error', `Failed to create signed URL for voicemail`, { error: error.message });
    return null;
  }
};

const handleAudio = async (supabase, twiml, block, workspace) => {
  const { type, audioFile } = block;

  if (type === "recorded") {
    try {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("workspaceAudio")
        .createSignedUrl(`${workspace}/${audioFile}`, 3600);

      if (signedUrlError) {
        log('error', 'Failed to get signed URL', { error: signedUrlError });
        throw signedUrlError;
      }

      // Check for both camelCase and uppercase URL variants
      const signedUrl = signedUrlData?.signedUrl || signedUrlData?.signedURL;

      if (!signedUrl) {
        log('error', 'No signed URL returned', { signedUrlData });
        throw new Error('No signed URL returned');
      }

      log('info', 'Successfully got signed URL', {
        url: signedUrl.substring(0, 50) + '...'
      });

      return signedUrl;
    } catch (error) {
      log('error', 'Unexpected error in handleAudio', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  return audioFile;
};

const handleOptions = async (twiml, block, page_id, script, outreach_id, supabase, workspace) => {
  log('info', 'Starting handleOptions', {
    blockId: block.id,
    type: block.type,
    responseType: block.responseType
  });

  const audio = await handleAudio(supabase, twiml, block, workspace);

  if (block.responseType === "speech") {
    if (block.type === 'recorded') {
      twiml.play(audio);
    } else {
      twiml.say(audio);
    }

    const gatherOptions = {
      action: `${baseUrl}/ivr-flow`,
      timeout: 5,
      input: "speech",
      speechTimeout: "auto",
      speechModel: "phone_call",
      statusCallback: `${baseUrl}/ivr-status`,
      statusCallbackEvent: ['completed', 'failed']
    };

    if (block.responseType === "speech") {
      twiml.record({
        action: `${baseUrl}/ivr-recording`,
        timeout: 5,
        maxLength: 60,
        playBeep: true,
        recordingStatusCallback: `${baseUrl}/ivr-recording`,
        recordingStatusCallbackEvent: ["completed", "in-progress"]
      });
    } else {
      const gather = twiml.gather(gatherOptions);
      if (block.type === 'recorded') {
        gather.play(audio);
      } else {
        gather.say(audio);
      }
    }
  } else if (block.options && block.options.length > 0) {
    const gather = twiml.gather({
      action: `${baseUrl}/ivr-flow`,
      input: block.responseType === "dtmf-speech" ? "dtmf speech" : "dtmf",
      beep: true,
      timeout: 5,
      statusCallback: `${baseUrl}/ivr-status`,
      statusCallbackEvent: ['completed', 'failed']
    });
    if (block.type === 'recorded') {
      gather.play(audio);
    } else {
      gather.say(audio);
    }
  } else {
    if (block.type === 'recorded') {
      twiml.play(audio);
    } else {
      twiml.say(audio);
    }
    const nextStep = findNextStep(block, null, script, page_id);
    const { error } = await supabase.from("outreach_attempt").update({
      current_step: nextStep
    }).eq("id", outreach_id);
    if (error) {
      log('error', 'Failed to update current_step', { error });
      throw error;
    }
    twiml.redirect({
      method: 'POST'
    }, `${baseUrl}/ivr-flow`);  
  }
};

const processResult = async (supabase, script, currentStep, result, userInput, outreach_attempt_id) => {
  let step = currentStep || 'page_1:block_1';
  if (step === 'hangup') {
    return { step, result };
  }
  let [currentPageId, currentBlockId] = step.split(':');
  let currentBlock = script.blocks[currentBlockId];

  if (userInput !== undefined) {
    // Ensure the result structure matches the script structure
    const sanitizedInput = typeof userInput === 'string' ? userInput.trim() : userInput;

    result = {
      ...result,
      [currentPageId]: {
        ...(result[currentPageId] || {}),
        [currentBlock.title]: sanitizedInput,
      },
    };

    // Log the result for debugging
    log('info', 'Processing result', {
      step,
      blockTitle: currentBlock.title,
      input: sanitizedInput
    });

    const nextStep = findNextStep(currentBlock, sanitizedInput, script, currentPageId);
    step = nextStep;

    const { error } = await supabase
      .from("outreach_attempt")
      .update({
        result,
        current_step: step,
      })
      .eq("id", outreach_attempt_id);

    if (error) {
      log('error', 'Failed to update result', { error });
      throw error;
    }
  }

  return { step, result };
};

const getWorkspaceData = async (supabase, workspace_id: string) => {
  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspace_id)
    .single();
    
  if (error || !data) {
    throw new Error("Failed to retrieve workspace data");
  }
  
  return data;
};

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    // Get request details for validation
    const publicUrl = `https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1/ivr-flow`;
    const twilioSignature = req.headers.get('x-twilio-signature');
    
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());
    const event: TwilioEventData = params;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const callSid = event.CallSid;
    
    if (!callSid) {
      throw new Error("Missing CallSid");
    }

    const callData = await getCallWithRetry(supabase, callSid);
    if (!callData.workspace) {
      throw new Error("Call data missing workspace ID");
    }
    
    const workspaceData = await getWorkspaceData(supabase, callData.workspace);
    const isValidRequest = validateRequest(
      workspaceData.twilio_data.authToken,
      twilioSignature || '',
      publicUrl,
      params
    );

    if (!isValidRequest) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }

    const { VoiceResponse } = Twilio.twiml;
    const twiml = new VoiceResponse();

    if (event.RecordingUrl) {
      twiml.redirect(`${baseUrl}/ivr-recording`);
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (!callData.campaign?.ivr_campaign?.[0]?.script?.steps) {
      throw new Error("Invalid IVR campaign structure");
    }

    let currentStep = callData.outreach_attempt?.current_step || 'page_1:block_1';
    let [currentPageId, currentBlockId] = currentStep.split(':');
    const script = callData.campaign.ivr_campaign[0].script.steps;
    let currentBlock = script.blocks[currentBlockId];
    let userInput = event.Digits || event.SpeechResult;
    let result = callData.outreach_attempt?.result || {};

    if (event.AnsweredBy?.includes('machine') && !event.AnsweredBy.includes('other')) {
      if (!callData.campaign.voicemail_file) {
        // Update disposition to voicemail-no-message if we have no voicemail to leave
        const { error: dispositionError } = await supabase
          .from("outreach_attempt")
          .update({ disposition: 'voicemail-no-message' })
          .eq("id", callData.outreach_attempt?.id);

        if (dispositionError) {
          log('error', 'Failed to update disposition for voicemail-no-message', { error: dispositionError });
        }
        twiml.hangup();
      } else {
        // Update disposition to voicemail if we're leaving a message
        const { error: dispositionError } = await supabase
          .from("outreach_attempt")
          .update({ disposition: 'voicemail' })
          .eq("id", callData.outreach_attempt?.id);

        if (dispositionError) {
          log('error', 'Failed to update disposition for voicemail', { error: dispositionError });
        }
        const audio = await handleVMAudio(supabase, callData.campaign, callData.workspace);
        if (audio) {
          twiml.pause({ length: 4 });
          twiml.play(audio.signedUrl);
        } else {
          twiml.hangup();
        }
      }
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (currentStep === 'hangup') {
      twiml.hangup();
    } else {
      if (userInput) {
        const { step: newStep, result: newResult } = await processResult(supabase, script, currentStep, result, userInput, callData.outreach_attempt.id);
        currentStep = newStep;
        if (currentStep === 'hangup') {
          twiml.hangup();
          return new Response(twiml.toString(), {
            headers: { "Content-Type": "text/xml" },
          });
        }
        [currentPageId, currentBlockId] = currentStep.split(':');
        currentBlock = script.blocks[currentBlockId];
        result = newResult;
      }

      await handleOptions(
        twiml,
        currentBlock,
        currentPageId,
        script,
        callData.outreach_attempt.id,
        supabase,
        callData.workspace
      );
    }
    log('info', 'Flow completed', {
      callSid,
      duration: `${Date.now() - startTime}ms`
    });

    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });

  } catch (error) {
    log('error', 'Flow error', { error: error.message, stack: error.stack });
    const { VoiceResponse } = Twilio.twiml;
    const errorTwiml = new VoiceResponse();
    errorTwiml.say("An error occurred. Please try again later.");
    errorTwiml.hangup();
    
    return new Response(errorTwiml.toString(), {
      headers: { "Content-Type": "text/xml" },
      status: 500
    });
  }
});