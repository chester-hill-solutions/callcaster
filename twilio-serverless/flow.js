const { createClient } = require("@supabase/supabase-js");
const Twilio = require("twilio");

const MAX_RETRIES = 5;
const RETRY_DELAY = 200;

const log = (level, message, data = {}) => {
  console[level](`[${new Date().toISOString()}] ${message}`, JSON.stringify(data));
};

const encodeSignedUrl = (signedUrl) => {
  try {
    // Split the URL into parts (before and after the query string)
    const [baseUrl, queryString] = signedUrl.split('?');

    // Encode the base URL, preserving forward slashes
    const encodedBaseUrl = baseUrl.split('/').map(segment =>
      encodeURIComponent(segment)
    ).join('/');

    // If there's a query string, encode its parameters properly
    if (queryString) {
      const params = new URLSearchParams(queryString);
      // Create a new URLSearchParams object to properly encode values
      const encodedParams = new URLSearchParams();

      for (const [key, value] of params.entries()) {
        encodedParams.append(encodeURIComponent(key), encodeURIComponent(value));
      }

      return `${encodedBaseUrl}?${encodedParams.toString()}`;
    }

    return encodedBaseUrl;
  } catch (error) {
    console.error('Error encoding signed URL:', error);
    return signedUrl; // Return original URL if encoding fails
  }
};

const updateResult = async (supabase, outreach_attempt_id, update) => {
  if (!outreach_attempt_id) {
    throw new Error("outreach_attempt_id is undefined");
  }
  const { error } = await supabase
    .from('outreach_attempt')
    .update(update)
    .eq('id', outreach_attempt_id);
  if (error) throw error;
};

const updateCallStatus = async (supabase, callSid, status, timestamp) => {
  const { error } = await supabase
    .from('call')
    .update({ end_time: new Date(timestamp), status })
    .eq('sid', callSid);
  if (error) throw error;
};

const handleCallUpdate = async (supabase, callSid, status, timestamp, outreach_attempt_id, disposition) => {
  await Promise.all([
    updateCallStatus(supabase, callSid, status, timestamp),
    updateResult(supabase, outreach_attempt_id, { disposition })
  ]);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getCallWithRetry = async (supabase, callSid, retries = 0) => {
  const { data, error } = await supabase
    .from("call")
    .select('*, outreach_attempt(id, result, current_step), campaign(*,ivr_campaign(*, script(*)))')
    .eq("sid", callSid)
    .single();

  if (error || !data) {
    log('warn', `Failed to retrieve call data`, { callSid, error, retryAttempt: retries });
    if (retries < MAX_RETRIES) {
      await sleep(RETRY_DELAY);
      return getCallWithRetry(supabase, callSid, retries + 1);
    }
    log('error', `Failed to retrieve call after multiple attempts`, { callSid, maxRetries: MAX_RETRIES });
    throw new Error("Failed to retrieve call after multiple attempts");
  }
  return data;
};

const findNextStep = (currentBlock, userInput, script, pageId) => {
  log('debug', `Finding next step`, { currentBlockId: currentBlock.id, userInput, pageId });

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
  if (!voicemail_file) {
    log('warn', 'No voicemail file specified');
    return null;
  }
  try {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("workspaceAudio")
      .createSignedUrl(`${workspace}/${voicemail_file}`, 3600);

    if (signedUrlError) {
      throw signedUrlError;
    }
    return {
      ...signedUrlData,
      signedURL: signedUrlData.signedURL
    };
  } catch (error) {
    log('error', `Failed to create signed URL for voicemail`, { error: error.message });
    return null;
  }
};
const handleAudio = async (supabase, twiml, block, workspace) => {
  const { type, audioFile } = block;
  if (type === "recorded") {
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("workspaceAudio")
        .createSignedUrl(`${workspace}/${audioFile}`, 3600);
    if (signedUrlError) {
      log('error', `Failed to create signed URL`, { error: signedUrlError });
      throw signedUrlError;
    }
    log('info', 'Audio URL', signedUrlData.signedURL);
    return signedUrlData.signedURL;
  } else {
    return audioFile;
  }
};

const handleOptions = async (twiml, block, page_id, script, outreach_id, supabase, workspace) => {
  log('debug', `Handling options`, { blockId: block.id, hasOptions: !!(block.options && block.options.length > 0) });
  const audio = await handleAudio(supabase, twiml, block, workspace);

  if (block.responseType === "speech") {
    if (block.type === 'recorded') {
      twiml.play(audio);
    } else {
      twiml.say(audio);
    }
    twiml.record({
      action: `https://ivr-2916.twil.io/flow`,
      timeout: 5,
      maxLength: 60,
      playBeep: true,
      recordingStatusCallback: `https://ivr-2916.twil.io/flow`,
      recordingStatusCallbackEvent: ["completed"],
    });
  } else if (block.options && block.options.length > 0) {
    const gather = twiml.gather({
      action: `https://ivr-2916.twil.io/flow`,
      input: block.responseType || "dtmf speech",
      speechTimeout: "auto",
      speechModel: "phone_call",
      timeout: 5,
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


const processResult = async (supabase, script, currentStep, result, userInput, callSid) => {
  let step = currentStep || 'page_1:block_1';
  let [currentPageId, currentBlockId] = step.split(':');
  const currentBlock = script.blocks[currentBlockId];

  log('debug', `Processing step`, { step, userInput });

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

    //log('info', `Updating result and current step for call`, { callSid, result, step });
    await supabase
      .from("outreach_attempt")
      .update({ result, current_step: step })
      .eq("id", callSid);
  }

  return { step, result };
};

exports.handler = async function (context, event, callback) {
  const supabase = createClient(
    context.SUPABASE_URL,
    context.SUPABASE_SERVICE_KEY
  );
  const twiml = new Twilio.twiml.VoiceResponse();
  try {
    const callSid = event.CallSid;
    if (!callSid) {
      log('error', `Missing CallSid`);
      throw new Error("Missing CallSid");
    }

    // Handle recording results
    if (event.RecordingUrl) {
      log('info', 'Recording completed', { recordingUrl: event.RecordingUrl });
      const callData = await getCallWithRetry(supabase, callSid);

      // Get current step and block info
      const [currentPageId, currentBlockId] = callData.outreach_attempt.current_step.split(':');
      const script = callData.campaign.ivr_campaign[0].script.steps;
      const currentBlock = script.blocks[currentBlockId];

      // Update result with recording info for current block
      const result = {
        ...(callData.outreach_attempt?.result || {}),
        [currentPageId]: {
          ...(callData.outreach_attempt?.result?.[currentPageId] || {}),
          [currentBlock.title]: {
            recordingUrl: event.RecordingUrl,
            transcription: event.TranscriptionText || null
          }
        }
      };

      // Find and set next step
      const nextStep = findNextStep(currentBlock, null, script, currentPageId);
      await updateResult(supabase, callData.outreach_attempt.id, {
        result,
        current_step: nextStep
      });

      if (nextStep === 'hangup') {
        twiml.hangup();
      } else {
        twiml.redirect('https://ivr-2916.twil.io/flow');
      }

      return callback(null, twiml);
    }

    const userInput = event.Digits || event.SpeechResult;
    const callData = await getCallWithRetry(supabase, callSid);
    if (event.AnsweredBy && event.AnsweredBy.includes('machine') && !event.AnsweredBy.includes('other')) {
      await handleCallUpdate(supabase, callSid, 'voicemail', event.Timestamp, callData.outreach_attempt.id, 'voicemail');
      if (!callData.campaign.voicemail_file) {
        log('info', 'No voicemail file specified, hanging up');
        twiml.hangup();
      } else {
        try {
          const audio = await handleVMAudio(supabase, callData.campaign, callData.workspace);
          if (audio) {
            twiml.pause({ length: 4 });
            twiml.play(audio.signedURL);
          } else {
            log('warn', 'Failed to retrieve voicemail audio, hanging up');
            twiml.hangup();
          }
        } catch (error) {
          log('error', 'Error handling voicemail audio', { error: error.message });
          twiml.hangup();
        }
      }
      return callback(null, twiml);
    }
    if (!callData.campaign?.ivr_campaign?.[0]?.script?.steps) {
      log('error', `Invalid IVR campaign structure`, { callSid, campaignId: callData.campaign?.id });
      throw new Error("Invalid IVR campaign structure");
    }
    const script = callData.campaign.ivr_campaign[0].script.steps;
    let result = callData.outreach_attempt?.result || {};
    let currentStep = callData.outreach_attempt?.current_step;
    const processedStep = await processResult(supabase, script, currentStep, result, userInput, callData.outreach_attempt.id);
    currentStep = processedStep.step;
    result = processedStep.result;

    if (currentStep === 'hangup') {
      //log('info', `Ending call`, { callSid });
      twiml.hangup();
    } else {
      log('info', `Processing step`, { callSid, currentStep });
      const [currentPageId, currentBlockId] = currentStep.split(':');
      const currentBlock = script.blocks[currentBlockId];
      await handleOptions(twiml, currentBlock, currentPageId, script, callData.outreach_attempt.id, supabase, callData.workspace);
      if (!(currentBlock.options && currentBlock.options.length > 0)) {
        const nextStep = findNextStep(currentBlock, null, script, currentPageId);
        if (nextStep !== 'hangup') {
          await supabase
            .from("outreach_attempt")
            .update({ current_step: nextStep })
            .eq("id", callData.outreach_attempt.id);
        }
        twiml.redirect('https://ivr-2916.twil.io/flow');
      }
    }
  } catch (e) {
    log('error', `IVR Error`, { error: e.message, stack: e.stack });
    twiml.say("An error occurred. Please try again later.");
    twiml.hangup();
    return callback(e, twiml);
  }

  //log('info', `Completed IVR flow iteration`);
  return callback(null, twiml);
};