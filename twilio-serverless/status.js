const { createClient } = require("@supabase/supabase-js");
const Twilio = require("twilio");

const log = (level, message, data = {}) => {
  console[level](`[${new Date().toISOString()}] ${message}`, JSON.stringify(data));
};

const getCallWithRetry = async (supabase, callSid, retries = 0) => {
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
    const matchedOption = currentBlock.options.find((option) => {
      const optionValue = String(option.value).trim();
      const input = userInput !== undefined ? String(userInput).trim() : '';
      return optionValue === input || (input.length > 0 && optionValue === 'vx-any');
    });
    if (matchedOption) {
      if (matchedOption.next) {
        return matchedOption.next;
      }
    }
  }

  const nextBlock = findNextBlock(script, pageId, currentBlock.id);
  if (nextBlock) {
    return `${nextBlock.pageId}:${nextBlock.blockId}`;
  }
  return 'hangup';
};

const findNextBlock = (script, currentPageId, currentBlockId) => {
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
      action: 'https://ivr-2916.twil.io/flow',
      timeout: 5,
      input: "speech",
      speechTimeout: "auto",
      speechModel: "phone_call",
      statusCallback: 'https://ivr-2916.twil.io/status',
      statusCallbackEvent: ['completed', 'failed']
    };

    if (block.responseType === "speech") {
      twiml.record({
        action: 'https://ivr-2916.twil.io/recording',
        timeout: 5,
        maxLength: 60,
        playBeep: true,
        recordingStatusCallback: 'https://ivr-2916.twil.io/recording',
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
      action: `https://ivr-2916.twil.io/flow`,
      input: block.responseType === "dtmf-speech" ? "dtmf speech" : "dtmf",
      timeout: 5,
      statusCallback: 'https://ivr-2916.twil.io/status',
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
    }, `https://ivr-2916.twil.io/flow`);
  }
};

const processResult = async (supabase, script, currentStep, result, userInput, outreach_attempt_id) => {
  let step = currentStep || 'page_1:block_1';
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

exports.handler = async function (context, event, callback) {
  const startTime = Date.now();
  const supabase = createClient(context.SUPABASE_URL, context.SUPABASE_SERVICE_KEY);
  const twiml = new Twilio.twiml.VoiceResponse();

  try {
    const callSid = event.CallSid;
    if (!callSid) throw new Error("Missing CallSid");

    if (event.RecordingUrl) {
      twiml.redirect('https://ivr-2916.twil.io/recording');
      return callback(null, twiml);
    }

    const callData = await getCallWithRetry(supabase, callSid);
    if (!callData.campaign?.ivr_campaign?.[0]?.script?.steps) {
      throw new Error("Invalid IVR campaign structure");
    }
    log('info', 'Retrieved call data', {
      currentStep: callData.outreach_attempt?.current_step,
      scriptBlocks: Object.keys(callData.campaign.ivr_campaign[0].script.steps.blocks).length,
      campaignId: callData.campaign?.id
    });

    let currentStep = callData.outreach_attempt?.current_step || 'page_1:block_1';
    let [currentPageId, currentBlockId] = currentStep.split(':');
    const script = callData.campaign.ivr_campaign[0].script.steps;
    let currentBlock = script.blocks[currentBlockId];
    let userInput = event.Digits || event.SpeechResult;
    let result = callData.outreach_attempt?.result || {};

    // Handle voicemail detection
    if (event.AnsweredBy?.includes('machine') && !event.AnsweredBy.includes('other')) {
      if (!callData.campaign.voicemail_file) {
        twiml.hangup();
      } else {
        const audio = await handleVMAudio(supabase, callData.campaign, callData.workspace);
        if (audio) {
          twiml.pause({ length: 4 });
          twiml.play(audio.signedUrl);
        } else {
          twiml.hangup();
        }
      }
      return callback(null, twiml);
    }

    if (currentStep === 'hangup') {
      twiml.hangup();
    } else {
      if (userInput) {
        const { step: newStep, result: newResult } = await processResult(supabase, script, currentStep, result, userInput, callData.outreach_attempt.id);
        currentStep = newStep;
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

    return callback(null, twiml);
  } catch (error) {
    log('error', 'Flow error', { error: error.message, stack: error.stack });
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
    return callback(null, twiml);
  }
};