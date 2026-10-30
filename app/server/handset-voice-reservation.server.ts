import { and, eq, gt } from "drizzle-orm";
import { handset_session, user, workspace, workspace_member, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { getHandsetNumberForWorkspace, createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { resolveCallerIdUsability } from "@/lib/caller-id-usability.server";
import { normalizePhoneNumber } from "@/lib/phone";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { matchesVoiceSetupRoot, type VoiceSetupRoot } from "@/lib/voice-bridge-identity";
import { reserveVoiceCreditsInTransaction, type VoiceReservation } from "./voice-credit-reservation.server";
import { persistReservedVoiceCall } from "./voice-reservation-callback.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import { WORKSPACE_MEMBERSHIP_ROLES } from "@/lib/workspace-membership.server";

type HandsetContext = { workspaceId: string; clientIdentity: string; userId: string };

async function ownedHandset(tx: CreditTransaction, args: HandsetContext) {
  const tdb = createTenantDb(args.workspaceId, tx);
  const session = await tdb.handset_session.findFirst({ where: and(
    eq(handset_session.client_identity, args.clientIdentity), eq(handset_session.user_id, args.userId),
    eq(handset_session.status, "active"), gt(handset_session.expires_at, new Date().toISOString()),
  ) });
  const member = await tdb.workspace_member.findFirst({ where: eq(workspace_member.user_id, args.userId) });
  const [actor] = await tx.select({ access: user.access_level }).from(user).where(eq(user.id, args.userId));
  return session && member && WORKSPACE_MEMBERSHIP_ROLES.some((role) => role === member.role_id) && actor && actor.access !== "disabled" ? tdb : null;
}

function canReplayPreparation(row: VoiceReservation, args: HandsetContext, recipient: string) {
  return row.state === "reserved" && !row.send_started_at && !row.setup_sid && row.recipient === recipient &&
    row.user_id === args.userId && row.setup_client_identity === args.clientIdentity && row.lease_expires_at.getTime() > Date.now();
}

export async function prepareHandsetVoiceDial(args: HandsetContext & { to: string; intentId: string }) {
  let recipient: string;
  try { recipient = normalizePhoneNumber(args.to); }
  catch { return { ok: false as const, reason: "invalid_phone" as const }; }
  return db.transaction(async (tx) => {
    const [owner] = await tx.select().from(workspace).where(eq(workspace.id, args.workspaceId)).for("no key update");
    if (!owner || owner.archived_at) return { ok: false as const, reason: "workspace_not_found" as const };
    if (owner.disabled) return { ok: false as const, reason: "workspace_unavailable" as const };
    const tdb = await ownedHandset(tx, args);
    if (!tdb) return { ok: false as const, reason: "handset_not_found" as const };
    const operationKey = `handset:${args.intentId.toLowerCase()}`;
    const existing = await tdb.workspace_voice_reservation.findFirst({ where: eq(reservations.operation_key, operationKey),
      orderBy: (row, { desc }) => [desc(row.created_at)] });
    if (existing && (existing.state !== "released" || existing.setup_sid || existing.provider_sid)) {
      if (!canReplayPreparation(existing, args, recipient)) {
        return { ok: false as const, reason: "dispatch_in_progress" as const };
      }
      const caller = await resolveCallerIdUsability(args.workspaceId, existing.caller_id, { tdb });
      return caller.kind === "ok" ? { ok: true as const, reservation: existing } :
        { ok: false as const, reason: "caller_id_unavailable" as const };
    }
    const credentials = readTwilioWorkspaceCredentials(owner.twilio_data);
    const { data: handset } = await getHandsetNumberForWorkspace({ workspaceId: args.workspaceId, tdb });
    if (!credentials || !handset?.phone_number ||
        (await resolveCallerIdUsability(args.workspaceId, handset.phone_number, { tdb })).kind !== "ok") {
      return { ok: false as const, reason: "caller_id_unavailable" as const };
    }
    return reserveVoiceCreditsInTransaction(tx, { workspaceId: args.workspaceId, userId: args.userId,
      accountSid: credentials.sid, kind: "staffed", to: recipient, from: handset.phone_number,
      setupTo: "", setupClientIdentity: args.clientIdentity, operationKey });
  });
}

type HandsetVoiceRequest = {
  workspaceId: string; clientIdentity: string; reservationId: string; recipient: string;
  callSid: string; accountSid: string; from: string; direction: string; parentCallSid?: string;
  requestUrl: string; statusCallback: string;
  continuationUrl?: string;
};

function matchesHandsetRequest(row: VoiceReservation, args: HandsetVoiceRequest) {
  return row.setup_client_identity === args.clientIdentity && row.setup_to === "" &&
    row.account_sid === args.accountSid && row.recipient === args.recipient &&
    args.from === `client:${args.clientIdentity}` && args.direction === "inbound" && !args.parentCallSid;
}

async function claimHandsetRecipient(row: VoiceReservation, args: HandsetVoiceRequest, root: VoiceSetupRoot) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(reservations).where(and(
      eq(reservations.id, row.id), eq(reservations.workspace, args.workspaceId),
    )).for("update");
    if (!current?.user_id || current.state !== "reserved" || current.send_started_at ||
        current.recipient_instruction_issued_at || current.lease_expires_at.getTime() <= Date.now() ||
        current.caller_id !== row.caller_id || current.user_id !== row.user_id ||
        !matchesHandsetRequest(current, args) || !matchesVoiceSetupRoot(current, root)) return null;
    const [owner] = await tx.select({ disabled: workspace.disabled, archived: workspace.archived_at }).from(workspace)
      .where(eq(workspace.id, args.workspaceId));
    const tdb = await ownedHandset(tx, { ...args, userId: current.user_id });
    if (!owner || owner.disabled || owner.archived || !tdb ||
        (await resolveCallerIdUsability(args.workspaceId, current.caller_id, { tdb })).kind !== "ok") return null;
    const now = new Date();
    const [issued] = await tx.update(reservations).set({ state: "creating", setup_sid: root.sid,
      send_started_at: now, recipient_instruction_issued_at: now, setup_voice_url: args.requestUrl,
      status_callback: args.statusCallback, setup_continuation_url: args.continuationUrl, updated_at: now,
    }).where(eq(reservations.id, current.id)).returning();
    if (!issued) throw new Error("Handset recipient instruction was not saved");
    await persistReservedVoiceCall(tx, issued, root.sid, "setup");
    return issued;
  });
}

/** Raw provider signature validation must precede this call. */
export async function startPreparedHandsetVoiceRecipient<T>(args: HandsetVoiceRequest, buildInstruction: (row: VoiceReservation) => T) {
  if (!/^[0-9a-f-]{36}$/i.test(args.reservationId) || !/^CA[0-9a-f]{32}$/i.test(args.callSid)) return null;
  const row = await createTenantDb(args.workspaceId).workspace_voice_reservation.findFirst({
    where: eq(reservations.id, args.reservationId),
  });
  if (!row || !matchesHandsetRequest(row, args)) return null;
  const client = await createWorkspaceTwilioInstance({ workspace_id: args.workspaceId });
  if (client.accountSid !== row.account_sid) return null;
  const root = await client.calls(args.callSid).fetch();
  if (root.sid !== args.callSid || !matchesVoiceSetupRoot(row, root) ||
      !["queued", "initiated", "ringing", "in-progress"].includes(root.status)) return null;
  const instruction = buildInstruction({ ...row, setup_continuation_url: args.continuationUrl ?? row.setup_continuation_url });
  const issued = await claimHandsetRecipient(row, args, root);
  return issued ? { reservation: issued, instruction } : null;
}
