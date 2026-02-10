import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import { validateRequest } from "npm:twilio@^5.3.0/lib/webhooks/webhooks.js";

interface TwilioEventData {
  CallSid?: string;
  RecordingUrl?: string;
  RecordingStatus?: string;
}

interface WorkspaceData {
  id: string;
  twilio_data: {
    sid: string;
    authToken: string;
  };
}

const log = (level: string, message: string, data = {}) => {
  console[level](`[${new Date().toISOString()}] ${message}`, JSON.stringify(data));
};
const baseUrl = 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1/';

interface CallDataWithOutreach {
  outreach_attempt: {
    id: number;
  };
  [key: string]: unknown;
}

interface ScriptBlock {
  id: string;
  options?: Array<{
    value: string;
    next?: string;
  }>;
  [key: string]: unknown;
}

interface ScriptPage {
  blocks: string[];
  [key: string]: unknown;
}

interface Script {
  pages: Record<string, ScriptPage>;
  [key: string]: unknown;
}

const createAndUploadRecording = async (
  supabase: SupabaseClient,
  callData: CallDataWithOutreach,
  recordingUrl: string,
  workspace: WorkspaceData,
  stepName: string,
  attempt = 1
) => {
  const MAX_ATTEMPTS = 3;
  const INITIAL_DELAY = 1000;

  try {
    const recordingResponse = await fetch(recordingUrl, {
      headers: {
        'Authorization': `Basic ${btoa(`${workspace.twilio_data.sid}:${workspace.twilio_data.authToken}`)}`
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
    const fileName = `${workspace.id}/recording-${callData.outreach_attempt.id}-${stepName.replace(':', '_')}.wav`;
    
    const { error: uploadError } = await supabase.storage
      .from("workspaceAudio")
      .upload(fileName, arrayBuffer, {
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

const getWorkspace = async (supabase: SupabaseClient, workspace_id: string): Promise<WorkspaceData> => {
  const { data, error } = await supabase
    .from('workspace')
    .select('id, twilio_data')
    .eq('id', workspace_id)
    .single();
  if (error) throw error;
  return data;
};

const getCallWithScript = async (supabase: SupabaseClient, callSid: string) => {
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

const findNextStep = (currentBlock: ScriptBlock, userInput: unknown, script: Script, pageId: string): string => {
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

const findNextBlock = (script: Script, currentPageId: string, currentBlockId: string): { pageId: string; blockId: string } | null => {
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

Deno.serve(async (req) => {
  try {
    // Get request details for validation
    const publicUrl = `https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1/ivr-recording`;
    log('info', 'Request URL', { url: publicUrl });
    
    const twilioSignature = req.headers.get('x-twilio-signature');
    log('info', 'Twilio signature', { twilioSignature });
    
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());
    log('info', 'Request parameters', { params });
    
    const event: TwilioEventData = params;
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { CallSid, RecordingUrl, RecordingStatus } = event;
    log('info', 'Event data', { CallSid, RecordingUrl, RecordingStatus });

    // Get call data first to get workspace ID
    log('info', 'Fetching call data', { CallSid });
    const callData = await getCallWithScript(supabase, CallSid!);
    if (!callData) {
      throw new Error("Call not found");
    }
    log('info', 'Call data retrieved', { workspace: callData.workspace });

    // Get workspace data and validate request
    log('info', 'Fetching workspace data', { workspace_id: callData.workspace });
    const workspace = await getWorkspace(supabase, callData.workspace);
    log('info', 'Validating request', {
      authTokenLength: workspace.twilio_data.authToken.length,
      url: publicUrl,
      paramsCount: Object.keys(params).length
    });
    
    const isValidRequest = validateRequest(
      workspace.twilio_data.authToken,
      twilioSignature || '',
      publicUrl,
      params
    );

    log('info', 'Request validation result', { isValidRequest });

    if (!isValidRequest) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }

    // Create TwiML response
    const { VoiceResponse } = Twilio.twiml;
    const twiml = new VoiceResponse();
    
    // If this is just a status callback, redirect back to flow
    if (RecordingStatus && !RecordingUrl) {
      log('info', 'Recording status update', { CallSid, RecordingStatus });
      twiml.redirect(`${baseUrl}/ivr-flow`);
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }
    
    if (!CallSid || !RecordingUrl) {
      log('error', 'Missing required parameters', { CallSid, RecordingUrl });
      twiml.redirect(`${baseUrl}/ivr-flow`);
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (callData?.outreach_attempt?.id) {
      const currentStep = callData.outreach_attempt?.current_step;
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
          ...(callData.outreach_attempt?.result || {}),
          [currentPageId]: {
            ...(callData.outreach_attempt?.result?.[currentPageId] || {}),
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
          .eq('id', callData.outreach_attempt?.id);

        log('info', 'Successfully processed recording', { 
          CallSid,
          outreachAttemptId: callData.outreach_attempt?.id 
        });
      } catch (uploadError) {
        log('error', 'Failed to process recording', { 
          error: uploadError instanceof Error ? uploadError.message : String(uploadError),
          CallSid 
        });
        // Continue with the flow even if recording fails
      }
    }

    // Always redirect back to main flow
    twiml.redirect(`${baseUrl}/ivr-flow`);
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });

  } catch (error) {
    // Create a default TwiML response for errors
    log('error', 'Recording handler error', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    const { VoiceResponse } = Twilio.twiml;
    const errorTwiml = new VoiceResponse();
    errorTwiml.say('An error occurred. Please try again later.');
    errorTwiml.redirect(`${baseUrl}/ivr-flow`);
    
    return new Response(errorTwiml.toString(), {
      headers: { "Content-Type": "text/xml" },
      status: 500
    });
  }
});