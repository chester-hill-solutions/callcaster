import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { workspace_voice_recording_operation as recordings, workspace_voice_reservation as reservations } from "@/db/schema";
import { VoiceRecordingBindingError, voiceRecordingCallbackUrl } from "@/lib/voice-recording";
import { db } from "./db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceDispatchUrls, VoiceReservation } from "./voice-credit-reservation.server";
import type { VoiceRecordingOperation } from "./voice-recording-operation.server";

/** Persist the callback nonce in the same checkpoint that permits one Call POST. */
export function voiceCustomerRecordingSendFields(row: VoiceReservation, urls: VoiceDispatchUrls) {
  const intent = urls.customerRecording;
  if (!row.audio_connection_id) {
    if (intent) throw new VoiceRecordingBindingError("Customer recording requires an owned phone source");
    return {};
  }
  if (!intent || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intent.id) ||
    intent.callbackUrl !== voiceRecordingCallbackUrl(urls.voiceUrl, intent.id))
    throw new VoiceRecordingBindingError("Customer send requires its recording callback");
  return { customer_recording_id: intent.id, customer_recording_callback: intent.callbackUrl };
}

function ownsCustomerRecording(row: VoiceRecordingOperation, owner: VoiceReservation, callSid: string) {
  return row.id === owner.customer_recording_id && row.kind === "customer" && row.reservation_id === owner.id &&
    row.intent_id === owner.id && row.user_id === owner.user_id && row.account_sid === owner.account_sid &&
    row.logical_call_sid === callSid && row.source_call_sid === callSid && row.source_parent_sid === null &&
    row.source_to === owner.recipient && row.source_from === owner.caller_id && row.source_direction === "outbound-api" &&
    row.callback_url === owner.customer_recording_callback && row.send_started_at !== null;
}

/** Canonical Call persistence repairs this part after early receipts or local faults. */
export async function persistVoiceCustomerRecording(tx: CreditTransaction, owner: VoiceReservation, callSid: string) {
  if (!owner.customer_recording_id && !owner.customer_recording_callback) return null;
  if (!owner.audio_connection_id || !owner.customer_recording_id || !owner.customer_recording_callback || !owner.user_id ||
    !owner.send_started_at || owner.setup_sid || owner.setup_to || owner.setup_client_identity || owner.state === "released" ||
    owner.provider_sid && owner.provider_sid !== callSid || !/^CA[0-9a-f]{32}$/i.test(callSid))
    throw new VoiceRecordingBindingError("Customer recording has no owned Call send");
  await tx.insert(recordings).values({ id: owner.customer_recording_id, workspace: owner.workspace,
    reservation_id: owner.id, user_id: owner.user_id, kind: "customer", intent_id: owner.id, account_sid: owner.account_sid,
    logical_call_sid: callSid, source_call_sid: callSid, source_parent_sid: null, source_to: owner.recipient,
    source_from: owner.caller_id, source_direction: "outbound-api", callback_url: owner.customer_recording_callback,
    state: "creating", send_started_at: owner.send_started_at, lease_token: randomUUID(),
    lease_expires_at: new Date(Date.now() + 5 * 60_000),
  }).onConflictDoNothing({ target: recordings.id });
  const [saved] = await tx.select().from(recordings).where(and(eq(recordings.id, owner.customer_recording_id), eq(recordings.workspace, owner.workspace)));
  if (!saved || !ownsCustomerRecording(saved, owner, callSid))
    throw new VoiceRecordingBindingError("Customer recording belongs to another Call send");
  return saved;
}

/** Provider-only launch lookup; signature and the exact callback still must match. */
export async function findVoiceCustomerRecordingLaunch(operationId: string) {
  const [row] = await db.select().from(reservations).where(eq(reservations.customer_recording_id, operationId)).limit(1);
  return row ?? null;
}
