/**
 * Hooks API Service Layer
 * Centralized API calls specifically for React hooks
 */
import type { VoiceAudioSourceIdentity } from "@/lib/voice-audio-connection";

interface HangupCallParams {
  callSid: string;
  workspaceId: string;
}

interface HangupCallResponse {
  success: boolean;
  message?: string;
}

export interface StartConferenceParams {
  caller_id: string;
  workspace_id: string;
  campaign_id: string;
  selected_device: string;
  dial_intent_id?: string;
  audioSource?: VoiceAudioSourceIdentity;
}

interface StartConferenceResponse {
  success: boolean;
  conferenceName?: string;
  callSid?: string;
  creditsError?: boolean;
  error?: string;
}

export async function prepareHandsetDial(params: {
  workspaceId: string; clientIdentity: string; to: string; intentId: string;
}): Promise<string> {
  const fallback = "We could not prepare this call. Please try again.";
  let response: Response;
  try {
    response = await fetch(`/api/workspaces/${encodeURIComponent(params.workspaceId)}/handset/session`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_number: params.to, client_identity: params.clientIdentity, dial_intent_id: params.intentId }),
    });
  } catch { throw new Error(fallback); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
    throw new Error(message);
  }
  if (!body || typeof body !== "object" || !("reservation_id" in body) ||
      typeof body.reservation_id !== "string" || !body.reservation_id.trim()) throw new Error(fallback);
  return body.reservation_id;
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

const CONFERENCE_START_FAILURE = "Could not start dialing. Try again.";
const DEFINITE_START_REFUSALS = new Set([400, 401, 403, 404, 429]);

export class ConferenceStartRefusedError extends Error {
  constructor(message: string) { super(message); this.name = "ConferenceStartRefusedError"; }
}
const CONFERENCE_START_MESSAGES = new Map([
  ["Campaign is paused.", "Campaign is paused."],
  ["Campaign is not live yet. Start it from the Launch page.", "Campaign is not live yet. Start it from the Launch page."],
  ["Campaign is not currently active", "Campaign is not active. Check the Launch page."],
  ["Selected device is not a verified phone number", "Select a verified device and try again."],
  ["Insufficient role", "You do not have permission to start this campaign."],
  ["Unauthorized", "Sign in, then try again."],
  ["Workspace not found", "This campaign is unavailable. Reload the page."],
  ["Campaign not found", "This campaign is unavailable. Reload the page."],
  ["Call creation needs provider verification", "Call start is pending provider verification. Please wait."],
  ["A call is awaiting completion or recovery", "A call is awaiting completion or recovery. Please wait."],
  ["No queued contacts", "No queued contacts."],
  ["No contacts within recipient calling hours", "No contacts within recipient calling hours."],
]);

function conferenceStartError(data: unknown): string {
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return CONFERENCE_START_FAILURE;
  }
  const message = data.error;
  return typeof message === "string"
    ? CONFERENCE_START_MESSAGES.get(message) ?? CONFERENCE_START_FAILURE
    : CONFERENCE_START_FAILURE;
}

function conferenceCustomerSid(data: object, required: boolean) {
  const sid = "callSid" in data ? data.callSid : undefined;
  if (sid === undefined && !required) return undefined;
  if (typeof sid !== "string" || !/^CA[0-9a-fA-F]{32}$/.test(sid)) throw new Error(CONFERENCE_START_FAILURE);
  return sid;
}

function conferenceStartResult(data: unknown, requireCustomer: boolean): StartConferenceResponse {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(CONFERENCE_START_FAILURE);
  }

  if ("creditsError" in data && data.creditsError === true) {
    return {
      success: false,
      creditsError: true,
      error: 'Insufficient credits to start conference',
    };
  }

  if ("success" in data && data.success === true) {
    if (!("conferenceName" in data) || typeof data.conferenceName !== "string" || !data.conferenceName.trim()) {
      throw new Error(CONFERENCE_START_FAILURE);
    }
    const callSid = conferenceCustomerSid(data, requireCustomer);
    return { success: true, conferenceName: data.conferenceName, ...(callSid ? { callSid } : {}) };
  }
  return { success: false, error: conferenceStartError(data) };
}

/**
 * Start a conference and initiate auto-dial
 * @param params - Conference and dial parameters
 * @returns Promise resolving to conference response
 * @throws Error if the API call fails or parameters are invalid
 */
export async function startConferenceAndDial(params: StartConferenceParams): Promise<StartConferenceResponse> {
  const { caller_id, workspace_id, campaign_id, selected_device } = params;

  const missingParams: string[] = [];
  if (!caller_id) missingParams.push('caller_id');
  if (!workspace_id) missingParams.push('workspace_id');
  if (!campaign_id) missingParams.push('campaign_id');
  if (!selected_device) missingParams.push('selected_device');

  if (missingParams.length > 0) {
    throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
  }
  if (params.audioSource && (!params.dial_intent_id || selected_device === "computer")) {
    throw new ConferenceStartRefusedError(CONFERENCE_START_FAILURE);
  }

  try {
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(workspace_id)}/campaigns/${encodeURIComponent(campaign_id)}/dialer/start`,
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caller_id,
        selected_device,
        dial_intent_id: params.dial_intent_id,
        ...(params.audioSource ? { audio_connection_id: params.audioSource.connectionId, audio_generation: params.audioSource.generation } : {}),
      }),
    },
    ).catch(() => {
      throw new Error(CONFERENCE_START_FAILURE);
    });

    if (response.status === 402) {
      // Insufficient credits — the route returns this as a graceful JSON
      // body, not a hard failure, so read it before the !response.ok gate
      // below would otherwise turn it into a thrown error.
      return {
        success: false,
        creditsError: true,
        error: 'Insufficient credits to start conference',
      };
    }

    if (!response.ok) {
      const errorData: unknown = await response.json().catch(() => null);
      const message = response.status < 500 ? conferenceStartError(errorData) : CONFERENCE_START_FAILURE;
      throw DEFINITE_START_REFUSALS.has(response.status) ? new ConferenceStartRefusedError(message) : new Error(message);
    }

    const data: unknown = await response.json().catch(() => null);
    return conferenceStartResult(data, Boolean(params.audioSource));
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred during conference setup');
  }
}

