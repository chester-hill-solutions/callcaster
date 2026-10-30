import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { workspace, workspace_voice_recording_operation as recordings, workspace_voice_reservation as reservations } from "@/db/schema";
import { matchesVoiceSetupRoot, type VoiceSetupRoot } from "@/lib/voice-bridge-identity";
import { VoiceRecordingBindingError, voiceRecordingCallbackUrl } from "@/lib/voice-recording";
import { db } from "./db";
import { createTenantDb } from "./tenant-db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

export type VoiceRecordingOperation = typeof recordings.$inferSelect;
const LEASE_MS = 5 * 60_000;

function ownsDial(row: VoiceRecordingOperation, reservation: VoiceReservation, rootSid: string) {
  return row.kind === "dial" && row.workspace === reservation.workspace && row.reservation_id === reservation.id &&
    row.user_id === reservation.user_id && row.account_sid === reservation.account_sid &&
    row.logical_call_sid === rootSid && row.source_call_sid === rootSid && row.source_parent_sid === null;
}

/** Prepare before rendering TwiML. The instruction transaction arms this exact nonce. */
export async function prepareVoiceDialRecording(owner: VoiceReservation, root: VoiceSetupRoot, baseUrl: string) {
  if (!/^CA[0-9a-f]{32}$/i.test(root.sid)) throw new VoiceRecordingBindingError("Invalid recording source SID");
  return db.transaction(async (tx) => {
    // This row alone serializes nonce preparation; no balance or audio role changes here.
    const [current] = await tx.select().from(reservations).where(and(
      eq(reservations.workspace, owner.workspace), eq(reservations.id, owner.id),
    )).for("update");
    if (!current?.user_id || current.user_id !== owner.user_id || current.account_sid !== owner.account_sid ||
        current.kind !== "staffed" || current.conference_id || !matchesVoiceSetupRoot(current, root))
      throw new VoiceRecordingBindingError("Recording source does not match its manual call");
    const tdb = createTenantDb(owner.workspace, tx);
    const existing = await tdb.workspace_voice_recording_operation.findFirst({ where: and(
      eq(recordings.reservation_id, current.id), eq(recordings.kind, "dial"),
    ) });
    if (existing) {
      if (!ownsDial(existing, current, root.sid)) throw new VoiceRecordingBindingError("Recording intent already has another source");
      return existing;
    }
    // Already issued legacy instructions cannot acquire a recording nonce retroactively.
    if (current.recipient_instruction_issued_at || current.setup_terminal_at ||
        current.state === "released" || current.state === "settled") return null;
    const id = randomUUID();
    const [saved] = await tdb.workspace_voice_recording_operation.insert({ id,
      reservation_id: current.id, user_id: current.user_id, kind: "dial", intent_id: current.id,
      account_sid: current.account_sid, logical_call_sid: root.sid, source_call_sid: root.sid,
      source_to: root.to, source_from: root.from, source_direction: root.direction, source_parent_sid: null,
      callback_url: voiceRecordingCallbackUrl(baseUrl, id), lease_token: randomUUID(),
      lease_expires_at: new Date(Date.now() + LEASE_MS),
    });
    if (!saved) throw new Error("Dial recording preparation was not saved");
    return saved;
  });
}

/** Call only inside the same transaction that grants the customer instruction. */
export async function armVoiceDialRecording(tx: CreditTransaction, reservation: VoiceReservation, operationId: string) {
  const [current] = await tx.select().from(recordings).where(and(
    eq(recordings.id, operationId), eq(recordings.workspace, reservation.workspace),
  )).for("update");
  if (!current || !reservation.setup_sid || !ownsDial(current, reservation, reservation.setup_sid) ||
      current.state !== "prepared" || current.send_started_at || current.provider_sid)
    throw new VoiceRecordingBindingError("Dial recording instruction is not prepared");
  const [saved] = await tx.update(recordings).set({ state: "creating", send_started_at: new Date(), updated_at: new Date() })
    .where(eq(recordings.id, current.id)).returning();
  if (!saved) throw new Error("Dial recording instruction checkpoint was not saved");
  return saved;
}

/** A provider-only nonce lookup; the receipt still has to prove the immutable owner. */
export async function findVoiceRecordingOperation(operationId: string) {
  const [row] = await db.select().from(recordings).where(eq(recordings.id, operationId)).limit(1);
  return row ?? null;
}

function sameOwner(current: VoiceRecordingOperation, owner: VoiceRecordingOperation) {
  return current.workspace === owner.workspace && current.reservation_id === owner.reservation_id &&
    current.user_id === owner.user_id && current.account_sid === owner.account_sid && current.kind === owner.kind &&
    current.intent_id === owner.intent_id && current.logical_call_sid === owner.logical_call_sid &&
    current.source_call_sid === owner.source_call_sid && current.source_to === owner.source_to &&
    current.source_from === owner.source_from && current.source_direction === owner.source_direction &&
    current.source_parent_sid === owner.source_parent_sid && current.callback_url === owner.callback_url;
}

/** Receipt handling never locks a reservation after taking the recording row lock. */
export async function withVoiceRecordingOperation<T>(owner: VoiceRecordingOperation,
  run: (tx: CreditTransaction, current: VoiceRecordingOperation) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspace)).for("no key update");
    const [current] = await tx.select().from(recordings).where(and(
      eq(recordings.id, owner.id), eq(recordings.workspace, owner.workspace),
    )).for("update");
    if (!current || !sameOwner(current, owner)) throw new VoiceRecordingBindingError("Recording operation does not match its owner");
    return run(tx, current);
  });
}

/** Both capture observation and media copy retries retain their current lease. */
export async function deferVoiceRecordingWork(owner: VoiceRecordingOperation, message: string,
  eligible: (current: VoiceRecordingOperation) => boolean) {
  await withVoiceRecordingOperation(owner, async (tx, current) => {
    if (current.lease_token !== owner.lease_token || !eligible(current)) return;
    await tx.update(recordings).set({ last_error: message, lease_expires_at: new Date(Date.now() + 5000), updated_at: new Date() })
      .where(eq(recordings.id, current.id));
  });
}
