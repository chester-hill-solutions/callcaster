/**
 * API Service Layer
 * Centralized API calls for hooks and components
 */

interface HangupCallParams {
  callSid: string;
  workspaceId: string;
}

interface HangupCallResponse {
  success: boolean;
  message?: string;
}

interface StartConferenceParams {
  user_id: string;
  caller_id: string;
  workspace_id: string;
  campaign_id: string;
  selected_device: string;
}

interface StartConferenceResponse {
  success: boolean;
  conferenceName?: string;
  creditsError?: boolean;
  error?: string;
}

/**
 * Hang up an active call
 * @param params - Call SID and workspace ID
 * @returns Promise resolving to hangup response
 * @throws Error if the API call fails
 */
export async function hangupCall(params: HangupCallParams): Promise<HangupCallResponse> {
  const { callSid, workspaceId } = params;

  if (!callSid) {
    throw new Error('Call SID is required');
  }

  if (!workspaceId) {
    throw new Error('Workspace ID is required');
  }

  try {
    const response = await fetch('/api/hangup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callSid, workspaceId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Network response was not ok' }));
      throw new Error(errorData.message || 'Network response was not ok');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while hanging up the call');
  }
}

/**
 * Start a conference and initiate auto-dial
 * @param params - Conference and dial parameters
 * @returns Promise resolving to conference response
 * @throws Error if the API call fails or parameters are invalid
 */
export async function startConferenceAndDial(params: StartConferenceParams): Promise<StartConferenceResponse> {
  const { user_id, caller_id, workspace_id, campaign_id, selected_device } = params;

  // Validate required parameters
  const missingParams: string[] = [];
  if (!user_id) missingParams.push('user_id');
  if (!caller_id) missingParams.push('caller_id');
  if (!workspace_id) missingParams.push('workspace_id');
  if (!campaign_id) missingParams.push('campaign_id');
  if (!selected_device) missingParams.push('selected_device');

  if (missingParams.length > 0) {
    throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
  }

  try {
    const response = await fetch('/api/auto-dial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id,
        caller_id,
        workspace_id,
        campaign_id,
        selected_device,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const data = await response.json();

    if (data.creditsError) {
      return {
        success: false,
        creditsError: true,
        error: 'Insufficient credits to start conference',
      };
    }

    if (data.success && !data.conferenceName) {
      throw new Error('Conference started but no conference name returned');
    }

    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred during conference setup');
  }
}

