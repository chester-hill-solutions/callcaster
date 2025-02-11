  const { createClient } = require("@supabase/supabase-js");
  const Twilio = require("twilio");

  const log = (level, message, data = {}) => {
    console[level](`[${new Date().toISOString()}] ${message}`, JSON.stringify(data));
  };

  const createAndUploadRecording = async (supabase, callData, recordingUrl, workspace, stepName, attempt = 1) => {
    const MAX_ATTEMPTS = 3;
    const INITIAL_DELAY = 1000;

    try {
      const recordingResponse = await fetch(recordingUrl, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${workspace.twilio_data.sid}:${workspace.twilio_data.authToken}`).toString('base64')}`
        }
      });

      if (!recordingResponse.ok) {
        if (attempt < MAX_ATTEMPTS) {
          const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          return createAndUploadRecording(supabase, callData, recordingUrl, workspace, stepName, attempt + 1);
        }
        throw new Error(`Failed to fetch recording: ${recordingResponse.statusText}`);
      }

      const recording = await recordingResponse.blob();
      const arrayBuffer = await recording.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const fileName = `${workspace.id}/recording-${callData.outreach_attempt.id}-${stepName.replace(':', '_')}.wav`;
      
      const { error: uploadError } = await supabase.storage
        .from("workspaceAudio")
        .upload(fileName, buffer, {
          cacheControl: "60",
          upsert: true,
          contentType: "audio/wav"
        });

      if (uploadError) throw uploadError;

      const { data: signedUrlData, error: signedUrlError } = await supabase
        .storage
        .from('workspaceAudio')
        .createSignedUrl(fileName, 8640000);

      if (signedUrlError) throw signedUrlError;
      return signedUrlData.signedUrl;
    } catch (error) {
      log('error', 'Recording processing failed', { error: error.message });
      throw error;
    }
  };

  async function getWorkspace(supabase, workspace_id) {
    const { data, error } = await supabase
      .from('workspace')
      .select('id, twilio_data')
      .eq('id', workspace_id)
      .single();
    if (error) throw error;
    return data;
  }

  const getCallWithScript = async (supabase, callSid) => {
    const { data, error } = await supabase
      .from("call")
      .select(`
        workspace,
        campaign(ivr_campaign(id, script(*))),
        outreach_attempt!inner(
          id,
          result,
          current_step
        )
      `)
      .eq("sid", callSid)
      .single();

    if (error || !data) throw error || new Error("Call not found");
    return data;
  };

  exports.handler = async function(context, event, callback) {
    const supabase = createClient(
      context.SUPABASE_URL,
      context.SUPABASE_SERVICE_KEY
    );
    const twiml = new Twilio.twiml.VoiceResponse();

    try {
      const { CallSid, RecordingUrl, RecordingStatus } = event;
      
      // If this is just a status callback, redirect back to flow
      if (RecordingStatus && !RecordingUrl) {
        log('info', 'Recording status update', { CallSid, RecordingStatus });
        twiml.redirect('https://ivr-2916.twil.io/flow');
        return callback(null, twiml);
      }
      
      if (!CallSid || !RecordingUrl) {
        log('error', 'Missing required parameters', { CallSid, RecordingUrl });
        twiml.redirect('https://ivr-2916.twil.io/flow');
        return callback(null, twiml);
      }

      // Fetch call data with minimal fields needed
      const callData = await getCallWithScript(supabase, CallSid);

      if (callData?.outreach_attempt?.id) {
        const workspace = await getWorkspace(supabase, callData.workspace);
        const currentStep = callData.outreach_attempt.current_step;
        const currentPageId = currentStep ? 
          currentStep.split(':')[0] : 
          'page_1';
        const currentBlockId = currentStep ? 
          currentStep.split(':')[1] : 
          'block_1';
        try {
          const recordingUrl = await createAndUploadRecording(
            supabase,
            callData,
            RecordingUrl,
            workspace,
            'Response'
          );

          const result = {
            ...(callData.outreach_attempt.result || {}),
            [currentPageId]: {
              ...(callData.outreach_attempt.result?.[currentPageId] || {}),
              Response: {
                recordingUrl,
                transcription: null
              }
            }
          };
          const script = callData.campaign.ivr_campaign[0].script.steps;
          const currentBlock = script.blocks[currentBlockId];
          const nextStep = findNextStep(currentBlock, null, script, currentPageId);

          await supabase
            .from('outreach_attempt')
            .update({ 
              result,  
              current_step: nextStep === 'hangup' ? currentStep : nextStep 
            })
            .eq('id', callData.outreach_attempt.id);

          log('info', 'Successfully processed recording', { 
            CallSid,
            outreachAttemptId: callData.outreach_attempt.id 
          });
        } catch (uploadError) {
          log('error', 'Failed to process recording', { 
            error: uploadError.message,
            CallSid 
          });
          // Continue with the flow even if recording fails
        }
      }

      // Always redirect back to main flow
      twiml.redirect('https://ivr-2916.twil.io/flow');
      return callback(null, twiml);

    } catch (error) {
      log('error', 'Recording handler error', { 
        error: error.message,
        stack: error.stack 
      });
      twiml.redirect('https://ivr-2916.twil.io/flow');
      return callback(null, twiml);
    }
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
    