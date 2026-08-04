export type QueueRecord = {
  id: number;
  workspace_id: string;
  name: string;
  hold_audio: string | null;
};

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
};

export function makeQueueName(queueId: number): string {
  return `inbound_q_${queueId}`;
}

export function parseQueueIdFromName(name: string | null): number | null {
  if (!name) return null;
  const match = name.match(/^inbound_q_(\d+)$/);
  return match && match[1] ? parseInt(match[1], 10) : null;
}

export function buildHoldMusicTwiml(args: {
  holdAudio: string | null;
  queueName: string;
}): string {
  if (args.holdAudio) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(args.holdAudio)}</Play></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alike" loop="0">You are now in the queue. Please wait for the next available agent.</Say></Response>`;
}

export function buildAgentBridgeTwiml(queueName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Queue>${escapeXml(queueName)}</Queue></Dial></Response>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
