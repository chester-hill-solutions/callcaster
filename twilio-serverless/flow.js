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
    if (matchedOption && matchedOption.next) {
      return matchedOption.next;
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
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("workspaceAudio")
      .createSignedUrl(`${workspace}/${audioFile}`, 3600);
      
    if (signedUrlError) throw signedUrlError;
    return signedUrlData.signedUrl;
  }
  return audioFile;
};

const handleOptions = async (twiml, block, page_id, script, outreach_id, supabase, workspace) => {
  const audio = await handleAudio(supabase, twiml, block, workspace);

  if (block.responseType === "speech") {
    if (block.type === 'recorded') {
      twiml.play(audio);
    } else {
      twiml.say(audio);
    }
    twiml.record({
      action: 'https://ivr-2916.twil.io/recording',
      timeout: 5,
      maxLength: 60,
      playBeep: true,
      recordingStatusCallback: 'https://ivr-2916.twil.io/recording',
      recordingStatusCallbackEvent: ["completed", "in-progress"],
      statusCallback: 'https://ivr-2916.twil.io/status',
      statusCallbackEvent: ['completed', 'failed']
    });
    
  } else if (block.options && block.options.length > 0) {
    const gather = twiml.gather({
      action: `https://ivr-2916.twil.io/flow`,
      input: block.responseType || "dtmf speech",
      speechTimeout: "auto",
      speechModel: "phone_call",
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
  }
};

const processResult = async (supabase, script, currentStep, result, userInput, outreach_attempt_id) => {
  let step = currentStep || 'page_1:block_1';
  let [currentPageId, currentBlockId] = step.split(':');
  const currentBlock = script.blocks[currentBlockId];

  if (userInput !== undefined) {
    result = {
      ...result,
      [currentPageId]: {
        ...(result[currentPageId] || {}),
        [currentBlock.title]: userInput,
      },
    };
    const nextStep = findNextStep(currentBlock, userInput, script, currentPageId);
    step = nextStep;

    await supabase
      .from("outreach_attempt")
      .update({ result, current_step: step })
      .eq("id", outreach_attempt_id);
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

    // Skip if this is a recording webhook - let recording.js handle it
    if (event.RecordingUrl) {
      twiml.redirect('https://ivr-2916.twil.io/recording');
      return callback(null, twiml);
    }

    const callData = await getCallWithRetry(supabase, callSid);
    if (!callData.campaign?.ivr_campaign?.[0]?.script?.steps) {
      throw new Error("Invalid IVR campaign structure");
    }

    let currentStep = callData.outreach_attempt?.current_step || 'page_1:block_1';
    const [currentPageId, currentBlockId] = currentStep.split(':');
    const script = callData.campaign.ivr_campaign[0].script.steps;
    const currentBlock = script.blocks[currentBlockId];
    const userInput = event.Digits || event.SpeechResult;
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

    const processedStep = await processResult(supabase, script, currentStep, result, userInput, callData.outreach_attempt.id);
    currentStep = processedStep.step;

    if (currentStep === 'hangup') {
      twiml.hangup();
    } else {
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