import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  call, inbound_voicemail_delivery as deliveryTable,
  inbound_voicemail_recipient as recipientTable,
} from "@/db/schema";
import type { VoicemailEmailPayload } from "@/db/schema-inbound-voicemail";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { isUniqueViolation } from "@/lib/parse-utils.server";
import { isConservativeEmail } from "../../shared/inbound-routing-presets";

export type VoicemailCallBinding = { workspaceId: string; callSid: string; phoneNumber: string };
export type VoicemailRecordingBinding = VoicemailCallBinding & { recordingSid: string; recordingUrl: string };
export type VoicemailDelivery = typeof deliveryTable.$inferSelect;
const LEASE_MS = 60_000;
// Resend retains keys for 24 hours; reserve an hour for clocks and transport delays.
const SAFE_RETRY_MS = 23 * 60 * 60_000;

function recordingIdentity(binding: VoicemailRecordingBinding) {
  return and(eq(deliveryTable.call_sid, binding.callSid), eq(deliveryTable.recording_sid, binding.recordingSid));
}
async function requireCall(binding: VoicemailCallBinding) {
  const stored = await createTenantDb(binding.workspaceId).call.findFirst({ where: eq(call.sid, binding.callSid) });
  if (!stored || stored.to !== binding.phoneNumber) throw new Error("Voicemail call binding does not match");
}
export async function bindInboundVoicemailRecipient(binding: VoicemailCallBinding, recipient: string) {
  if (!isConservativeEmail(recipient)) throw new Error("Invalid voicemail recipient");
  return db.transaction(async (tx) => {
    const [stored] = await tx.select().from(call)
      .where(and(eq(call.workspace, binding.workspaceId), eq(call.sid, binding.callSid))).for("update");
    if (!stored || stored.to !== binding.phoneNumber) throw new Error("Voicemail call binding does not match");
    const tdb = createTenantDb(binding.workspaceId, tx);
    const existing = await tdb.inbound_voicemail_recipient.findFirst({ where: eq(recipientTable.call_sid, binding.callSid) });
    if (existing) {
      if (existing.phone_number !== binding.phoneNumber || !isConservativeEmail(existing.recipient)) throw new Error("Voicemail recipient binding does not match");
      return existing.recipient;
    }
    await tdb.inbound_voicemail_recipient.insert({ call_sid: binding.callSid, phone_number: binding.phoneNumber, recipient });
    return recipient;
  });
}
export async function getInboundVoicemailRecipient(binding: VoicemailCallBinding): Promise<string | null> {
  await requireCall(binding);
  const row = await createTenantDb(binding.workspaceId).inbound_voicemail_recipient.findFirst({ where: eq(recipientTable.call_sid, binding.callSid) });
  if (!row) return null;
  if (row.phone_number !== binding.phoneNumber || !isConservativeEmail(row.recipient)) throw new Error("Voicemail recipient binding does not match");
  return row.recipient;
}
export async function findVoicemailDelivery(binding: VoicemailRecordingBinding) {
  await requireCall(binding);
  const row = await createTenantDb(binding.workspaceId).inbound_voicemail_delivery.findFirst({ where: recordingIdentity(binding) });
  if (row && (row.phone_number !== binding.phoneNumber || row.recording_url !== binding.recordingUrl)) throw new Error("Voicemail recording binding does not match");
  return row;
}
export async function prepareVoicemailDelivery(binding: VoicemailRecordingBinding, data: {
  recipient: string; signedUrl: string; payload: VoicemailEmailPayload;
}) {
  await requireCall(binding);
  const tdb = createTenantDb(binding.workspaceId);
  try {
    const [row] = await tdb.inbound_voicemail_delivery.insert({
      id: randomUUID(), call_sid: binding.callSid, recording_sid: binding.recordingSid,
      recording_url: binding.recordingUrl, phone_number: binding.phoneNumber,
      recipient: data.recipient, signed_url: data.signedUrl, email_payload: data.payload,
    });
    if (!row) throw new Error("Voicemail delivery was not saved");
    return row;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await findVoicemailDelivery(binding);
    if (!existing) throw error;
    return existing;
  }
}
export async function claimVoicemailDelivery(binding: VoicemailRecordingBinding, id: string) {
  await requireCall(binding);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(deliveryTable).where(and(
      eq(deliveryTable.workspace, binding.workspaceId), eq(deliveryTable.id, id), recordingIdentity(binding),
    )).for("update");
    if (!row || row.phone_number !== binding.phoneNumber || row.recording_url !== binding.recordingUrl) throw new Error("Voicemail delivery binding does not match");
    if (row.state === "sent") return { kind: "sent" as const, delivery: row };
    const now = new Date();
    if (row.state === "uncertain" || row.first_send_at && now.getTime() - row.first_send_at.getTime() >= SAFE_RETRY_MS) {
      await createTenantDb(binding.workspaceId, tx).inbound_voicemail_delivery.update({ set: { state: "uncertain", last_error: "Provider retry window expired; reconcile delivery before sending again." }, where: eq(deliveryTable.id, id) });
      return { kind: "uncertain" as const, delivery: row };
    }
    if (row.state === "sending" && row.lease_until && row.lease_until > now) return { kind: "busy" as const, delivery: row };
    const leaseToken = randomUUID();
    const [claimed] = await createTenantDb(binding.workspaceId, tx).inbound_voicemail_delivery.update({
      set: { state: "sending", first_send_at: row.first_send_at ?? now, lease_token: leaseToken, lease_until: new Date(now.getTime() + LEASE_MS), last_error: null }, where: eq(deliveryTable.id, id),
    });
    if (!claimed) throw new Error("Voicemail delivery claim was not saved");
    return { kind: "claimed" as const, delivery: claimed, leaseToken };
  });
}
export async function completeVoicemailDelivery(binding: VoicemailRecordingBinding, id: string, leaseToken: string, emailId: string) {
  const [row] = await createTenantDb(binding.workspaceId).inbound_voicemail_delivery.update({
    set: { state: "sent", sent_at: new Date(), resend_email_id: emailId, lease_token: null, lease_until: null, last_error: null },
    where: and(eq(deliveryTable.id, id), recordingIdentity(binding), eq(deliveryTable.lease_token, leaseToken), eq(deliveryTable.state, "sending")),
  });
  if (!row) throw new Error("Voicemail delivery receipt was not saved");
  return row;
}
export async function releaseVoicemailDelivery(binding: VoicemailRecordingBinding, id: string, leaseToken: string, error: unknown) {
  await createTenantDb(binding.workspaceId).inbound_voicemail_delivery.update({
    set: { state: "prepared", lease_token: null, lease_until: null, last_error: error instanceof Error ? error.message : String(error) },
    where: and(eq(deliveryTable.id, id), recordingIdentity(binding), eq(deliveryTable.lease_token, leaseToken), eq(deliveryTable.state, "sending")),
  });
}
