import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { call, user, workspace, workspace_voice_audio_connection as connections, workspace_voice_audio_intent as intents } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { getUserRole, WORKSPACE_MEMBERSHIP_ROLES } from "@/lib/workspace-membership.server";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { canTransitionCallStatus } from "@/lib/telephony-db.server";
import { logger } from "@/lib/logger.server";
import { RECOVERABLE_VOICE_AUDIO_STATES, VoiceAudioBindingError, voiceAudioRefusal } from "@/lib/voice-audio-connection";
import { lockVoiceAudioMember } from "./voice-audio-admission.server";
import { hasActiveVoiceAudioCustomer } from "./voice-audio-classification.server";
import { withVoiceAudioConnection, type VoiceAudioConnection } from "./voice-audio-connection.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import { persistVoiceAudioCall } from "./voice-audio-call-record.server";

type OwnedInput = { workspaceId: string; userId: string; connectionId: string; controlIntentId?: string };
const RECOVERY_LEASE_MS = 5 * 60_000;

async function ownedControl<T>(args: OwnedInput, run: (tx: CreditTransaction, row: VoiceAudioConnection) => Promise<T>) {
  return db.transaction(async (tx) => {
    const member = await lockVoiceAudioMember(tx, args, true);
    if (!member.ok) return member;
    const [row] = await tx.select().from(connections).where(and(eq(connections.id, args.connectionId),
      eq(connections.workspace, args.workspaceId), eq(connections.user_id, args.userId))).for("update");
    if (!row) return voiceAudioRefusal("connection_not_found");
    if (args.controlIntentId && args.controlIntentId !== (row.control_intent_id ?? row.intent_id)) return voiceAudioRefusal("stale_audio");
    return run(tx, row);
  });
}

export async function readOwnedVoiceAudioConnection(args: OwnedInput) {
  return ownedControl(args, async (_tx, row) => ({ ok: true as const, connection: row }));
}

function promotionIsUnfinished(row: VoiceAudioConnection) {
  return Boolean(row.promotion_requested_at && !row.committed_at && !row.conference_stopped_at);
}

/** Cancellation never changes the current customer or crosses a saved promotion. */
export async function cancelOwnedVoiceAudioConnection(args: OwnedInput) {
  return ownedControl(args, async (tx, row) => {
    const result = await cancelVoiceAudioConnectionInTransaction(tx, row);
    if (result.ok) await tx.update(intents).set({ cancel_requested_at: new Date() }).where(and(eq(intents.workspace, row.workspace),
      eq(intents.user_id, row.user_id), eq(intents.intent_id, row.control_intent_id ?? row.intent_id), isNull(intents.cancel_requested_at)));
    return result;
  });
}

/** Shares the actor/workspace transaction with submitted-request cancellation. */
export async function cancelVoiceAudioConnectionInTransaction(tx: CreditTransaction, row: VoiceAudioConnection) {
  let connection = row;
  if (!row.terminal_at) {
    if (promotionIsUnfinished(row)) return voiceAudioRefusal("handoff_in_progress");
    if (row.state === "active" && (row.target_kind !== "idle" ||
      await hasActiveVoiceAudioCustomer(createTenantDb(row.workspace, tx), row.conference_id))) return voiceAudioRefusal("active_customer_audio");
    if (!row.cancel_requested_at) {
      const [saved] = await tx.update(connections).set({ cancel_requested_at: new Date(),
        state: row.send_started_at ? row.state : "canceled", lease_expires_at: new Date(), updated_at: new Date(),
      }).where(eq(connections.id, row.id)).returning();
      if (!saved) throw new Error("Agent audio cancellation was not saved");
      connection = saved;
    }
  }
  return { ok: true as const, connection };
}

export async function claimVoiceAudioRecovery(limit = 10) {
  return db.transaction(async (tx) => {
    const rows = await tx.select({ id: connections.id }).from(connections).where(and(
      lt(connections.lease_expires_at, new Date()),
      or(and(inArray(connections.state, [...RECOVERABLE_VOICE_AUDIO_STATES]), isNull(connections.terminal_at)),
        and(isNotNull(connections.provider_sid), or(isNull(connections.terminal_at), isNotNull(connections.last_error))),
        and(isNotNull(connections.conference_stop_requested_at), isNull(connections.conference_stopped_at))),
    )).orderBy(connections.lease_expires_at).limit(limit).for("update", { skipLocked: true });
    if (!rows.length) return [];
    return tx.update(connections).set({ lease_token: randomUUID(), lease_expires_at: new Date(Date.now() + RECOVERY_LEASE_MS) })
      .where(inArray(connections.id, rows.map((r) => r.id))).returning();
  });
}

/** Only a recovery claim can expire preparation; no provider send can follow it. */
export async function expireUnsentVoiceAudio(row: VoiceAudioConnection) {
  return withVoiceAudioConnection(row, async (tx, current) => {
    if (current.lease_token !== row.lease_token || current.state !== "prepared" || current.send_started_at) return false;
    await tx.update(connections).set({ state: current.cancel_requested_at ? "canceled" : "failed",
      last_error: "Agent audio connection expired before send", updated_at: new Date(),
    }).where(eq(connections.id, current.id));
    return true;
  });
}

async function actorStillOwnsAudio(tx: CreditTransaction, row: VoiceAudioConnection) {
  const [owner] = await tx.select({ archived: workspace.archived_at }).from(workspace).where(eq(workspace.id, row.workspace));
  const [actor] = await tx.select({ access: user.access_level }).from(user).where(eq(user.id, row.user_id));
  if (!owner || owner.archived || !actor || actor.access === "disabled") return false;
  const member = await getUserRole({ user: { id: row.user_id }, workspaceId: row.workspace, tdb: createTenantDb(row.workspace, tx) });
  return Boolean(member && WORKSPACE_MEMBERSHIP_ROLES.some((role) => role === member.role));
}

/** Save stop intent before the provider update so new adoption cannot reuse it. */
export async function claimVoiceAudioStop(row: VoiceAudioConnection) {
  return withVoiceAudioConnection(row, async (tx, current) => {
    if (current.lease_token !== row.lease_token || !current.provider_sid || current.terminal_at || promotionIsUnfinished(current)) return null;
    const retiring = ["retired", "failed", "canceled"].includes(current.state);
    if (!current.cancel_requested_at && !retiring && current.state === "active" && await actorStillOwnsAudio(tx, current)) return null;
    const [saved] = await tx.update(connections).set({ cancel_requested_at: current.cancel_requested_at ?? new Date(), updated_at: new Date() })
      .where(eq(connections.id, current.id)).returning();
    return saved ?? null;
  });
}

function terminalAudioState(row: VoiceAudioConnection): VoiceAudioConnection["state"] {
  if (row.state === "retired") return "retired";
  return row.cancel_requested_at ? "canceled" : "failed";
}

function audioDuration(row: VoiceAudioConnection, savedDuration: string | null, duration?: string | null) {
  if (row.terminal_at && savedDuration != null) return savedDuration;
  return duration != null && /^\d+$/.test(duration) ? duration : savedDuration;
}

async function saveAudioCallStatus(args: { tx: CreditTransaction; row: VoiceAudioConnection; prior: VoiceAudioConnection; status: string; duration?: string | null }) {
  const { tx, row, prior, status, duration } = args;
  try {
    await tx.transaction(async (sp) => {
      const record = await persistVoiceAudioCall(sp, row);
      const effective = row.terminal_status ?? status;
      if (canTransitionCallStatus(record.status, effective)) await sp.update(call).set({ status: normalizeProviderStatus(effective),
        duration: audioDuration(prior, record.duration, duration), date_updated: new Date(),
      }).where(and(eq(call.sid, record.sid), eq(call.workspace, row.workspace)));
    });
    await tx.update(connections).set({ last_error: null }).where(eq(connections.id, row.id));
  } catch (error) {
    await tx.update(connections).set({ last_error: "Agent audio status record needs recovery", lease_expires_at: new Date() }).where(eq(connections.id, row.id));
    logger.error("voice_audio.status_record_pending", error);
  }
}

/** Audio status has no customer billing, disposition or queue side effects. */
export async function observeVoiceAudioStatus(row: VoiceAudioConnection, status: string, duration?: string | null) {
  const normalized = normalizeProviderStatus(status);
  if (!normalized) throw new VoiceAudioBindingError("Invalid agent audio status");
  return withVoiceAudioConnection(row, async (tx, current) => {
    if (!row.provider_sid || row.provider_sid !== current.provider_sid) throw new VoiceAudioBindingError("Agent audio status does not match its accepted leg");
    const terminal = isTerminalStatus(normalized);
    const [saved] = await tx.update(connections).set({
      terminal_at: current.terminal_at ?? (terminal ? new Date() : null), terminal_status: current.terminal_status ?? (terminal ? normalized : null),
      state: current.terminal_at || terminal ? terminalAudioState(current) : current.state, updated_at: new Date(),
    }).where(eq(connections.id, current.id)).returning();
    if (!saved) throw new Error("Agent audio status was not saved");
    await saveAudioCallStatus({ tx, row: saved, prior: current, status: normalized, duration });
    return saved;
  });
}
