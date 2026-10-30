import { accountSid, actor, baseUrl, callerId, customer, issued, joined, phone, rooms, web, workspaceId } from "./voice-audio-fixture";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { asRouteResponse, routeArgs } from "./route-result";
import { observeVoiceAudioConferenceEvent } from "@/server/voice-audio-conference.server";
import { verifyVoiceAudioCustomerSource } from "@/lib/voice-audio-customer-source.server";
import type { VoiceAudioCustomerSourceInput } from "@/server/voice-audio-customer-source.server";
import { reserveVoiceCredits, type VoiceReservationInput } from "@/server/voice-credit-reservation.server";

export function customerUrls() {
  const id = randomUUID();
  return { voiceUrl: `${baseUrl}/api/dial/${encodeURIComponent(customer)}`, statusCallback: `${baseUrl}/api/call-status/`,
    customerRecording: { id, callbackUrl: `${baseUrl}/api/voice-recording?recording=${id}` } };
}

export async function confirmed() {
  const row = await observeVoiceAudioConferenceEvent(joined(await issued()));
  if (!row?.provider_sid || !row.conference_sid) throw new Error("Confirmed phone fixture required");
  const call = { sid: row.provider_sid, accountSid, to: phone, from: callerId, direction: "outbound-api", parentCallSid: null,
    status: "in-progress", duration: null, dateCreated: new Date(), dateUpdated: new Date(), endTime: null,
    voiceUrl: row.voice_url, statusCallback: row.status_callback };
  const room = { sid: row.conference_sid, accountSid, friendlyName: row.conference_id, status: "in-progress" };
  const participant = { callSid: row.provider_sid, accountSid, conferenceSid: row.conference_sid,
    label: `audio:${row.id}:${row.generation}`, status: "connected", muted: false, hold: false };
  web.records.set(row.provider_sid, call); rooms.records.set(row.conference_sid, room); rooms.participant.mockResolvedValue(participant);
  const input: VoiceAudioCustomerSourceInput = { workspaceId, userId: actor, connectionId: row.id,
    generation: row.generation, campaignId: 123, phoneNumber: phone };
  return { row, call, room, participant, input };
}

export async function verified(f: Awaited<ReturnType<typeof confirmed>>) {
  const result = await verifyVoiceAudioCustomerSource(f.input);
  if (!result.ok) throw new Error(`Phone source verification refused: ${result.reason}`);
  return result.proof;
}

export async function customerAttempt(mode: "manual" | "predictive" = "manual") {
  const f = await confirmed(), proof = await verified(f);
  const args: VoiceReservationInput = { workspaceId, userId: actor, accountSid, kind: "staffed", to: customer, from: callerId,
    campaignId: 123, operationKey: `audio-customer:${randomUUID()}`, audioSource: {
      connectionId: f.row.id, generation: f.row.generation, destination: phone, mode, proof,
    } };
  return { ...f, args };
}

export async function fundCustomerAttempt(args: VoiceReservationInput) {
  const result = await reserveVoiceCredits(args);
  if (!result.ok) throw new Error(`Customer admission refused: ${result.reason}`);
  return result.reservation;
}

export async function signedCustomerRecording(url: string, params: Record<string, string>, valid = true) {
  const { action } = await import("../../app/routes/api+/voice-recording.action.server");
  return asRouteResponse(action(routeArgs(new Request(url, { method: "POST", headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Twilio-Signature": valid ? twilio.getExpectedTwilioSignature("owned-audio-token", url, params) : "invalid",
  }, body: new URLSearchParams(params) }))));
}
