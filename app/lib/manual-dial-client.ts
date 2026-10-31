import { z } from "zod";
import type { Campaign, Contact, OutreachAttempt, QueueItem } from "@/lib/types";
import type { VoiceAudioSourceIdentity } from "@/lib/voice-audio-connection";

export type StartCallArgs = {
  contact: Contact; campaign: Campaign; user: { id: string }; workspaceId: string;
  nextRecipient: QueueItem | null; recentAttempt: OutreachAttempt | null; selectedDevice: string | null;
  audioSource?: VoiceAudioSourceIdentity;
  acceptCustomer?: (sid: string) => boolean;
};

export function manualDialFields(args: StartCallArgs, intentId = crypto.randomUUID()): Record<string, string> | null {
  if (!args.contact.phone) return null;
  const data: Record<string, string> = { to_number: args.contact.phone, campaign_id: String(args.campaign.id), user_id: args.user.id,
    contact_id: String(args.contact.id), workspace_id: args.workspaceId, dial_intent_id: intentId };
  if (args.recentAttempt?.id != null) data.outreach_id = String(args.recentAttempt.id);
  if (args.nextRecipient?.id != null) data.queue_id = String(args.nextRecipient.id);
  if (args.nextRecipient?.dispatch_generation) data.expected_queue_generation = args.nextRecipient.dispatch_generation;
  if (args.campaign.caller_id) data.caller_id = args.campaign.caller_id;
  if (args.selectedDevice) data.selected_device = args.selectedDevice;
  if (args.audioSource) { data.audio_connection_id = args.audioSource.connectionId; data.audio_generation = String(args.audioSource.generation); }
  return data;
}

const receiptSchema = z.object({ success: z.literal(true), callSid: z.string().regex(/^CA[0-9a-f]{32}$/i) });
export async function sendManualAudioDial(fields: Readonly<Record<string, string>>) {
  try {
    const response = await fetch("/api/dial", { method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(fields) });
    const body: unknown = await response.json();
    const receipt = receiptSchema.safeParse(body);
    return response.ok && receipt.success && !(typeof body === "object" && body !== null && "error" in body) ? receipt.data.callSid : null;
  } catch { return null; }
}
