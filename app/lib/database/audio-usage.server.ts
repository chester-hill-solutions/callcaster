/**
 * Answers "what breaks if I change this audio file?".
 *
 * The audio library has no foreign keys: every consumer stores a bare
 * filename (see client/migrations/20260715120000_workspace_audio_metadata.sql).
 * So the only way to know a file's blast radius is to scan the columns and the
 * script JSON that reference it by name.
 */
import { and, eq, or } from "drizzle-orm";
import {
  campaign as campaignTable,
  inbound_queue as inboundQueueTable,
  script as scriptTable,
  workspace_number as workspaceNumberTable,
} from "@/db/schema";
import { db } from "@/server/db";

export type AudioUsageKind =
  | "campaign_voicedrop"
  | "campaign_voicemail"
  | "number_inbound"
  | "queue_hold"
  | "script_step";

export type AudioUsage = {
  kind: AudioUsageKind;
  /** Human-readable owner of the reference, for the confirmation dialog. */
  label: string;
  /** Route target so the user can go fix the reference. */
  campaignId?: number;
  scriptId?: number;
  queueId?: number;
  phoneNumber?: string;
};

/**
 * Keys that hold a recorded-audio filename in script JSON.
 *
 * Three names exist for one concept and they disagree:
 *   - docs/script-json-format.md + the vendored editor write `audioFile`,
 *     gated on `callcasterType === "recorded"`.
 *   - getRecordingFileNames() in workspace-media.server.ts reads `say`,
 *     gated on `speechType === "recorded"`.
 * Rather than pick a winner (and silently miss references stored under the
 * other), match on any of these keys holding this exact filename. A false
 * positive only over-warns; a false negative silently breaks a live campaign.
 */
const SCRIPT_AUDIO_KEYS = new Set(["audioFile", "say"]);

/** Walk arbitrary script JSON collecting values at audio-bearing keys. */
function collectScriptAudioNames(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectScriptAudioNames(item, found);
    return;
  }

  if (node === null || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      if (SCRIPT_AUDIO_KEYS.has(key) && value.trim().length > 0) {
        found.add(value.trim());
      }
      continue;
    }
    collectScriptAudioNames(value, found);
  }
}

/** Exported for tests: which audio filenames does this script reference? */
export function getScriptAudioReferences(steps: unknown): string[] {
  const found = new Set<string>();
  collectScriptAudioNames(steps, found);
  return [...found];
}

/**
 * Every reference to `fileName` in this workspace.
 *
 * `fileName` is the object name including extension ("intro.mp3"), matching
 * what the consumer columns store.
 */
export async function findAudioUsage(
  workspaceId: string,
  fileName: string,
): Promise<AudioUsage[]> {
  const target = fileName.trim();
  if (target.length === 0) return [];

  const [campaigns, numbers, queues, scripts] = await Promise.all([
    db
      .select({
        id: campaignTable.id,
        title: campaignTable.title,
        voicedrop_audio: campaignTable.voicedrop_audio,
        voicemail_file: campaignTable.voicemail_file,
      })
      .from(campaignTable)
      // Filenames are bare (no workspace prefix) and collide across tenants, so
      // every query must be scoped to this workspace or it leaks other tenants'
      // campaign/number/queue metadata on a name collision.
      .where(
        and(
          eq(campaignTable.workspace, workspaceId),
          or(
            eq(campaignTable.voicedrop_audio, target),
            eq(campaignTable.voicemail_file, target),
          ),
        ),
      ),
    db
      .select({
        phone_number: workspaceNumberTable.phone_number,
        friendly_name: workspaceNumberTable.friendly_name,
      })
      .from(workspaceNumberTable)
      .where(
        and(
          eq(workspaceNumberTable.workspace, workspaceId),
          eq(workspaceNumberTable.inbound_audio, target),
        ),
      ),
    db
      .select({ id: inboundQueueTable.id, name: inboundQueueTable.name })
      .from(inboundQueueTable)
      .where(
        and(
          eq(inboundQueueTable.workspace_id, workspaceId),
          eq(inboundQueueTable.hold_audio, target),
        ),
      ),
    // Script bodies are JSON, so the filename cannot be matched in SQL without
    // depending on a step shape that is not stable. Fetch this workspace's
    // scripts and walk them instead.
    db
      .select({
        id: scriptTable.id,
        name: scriptTable.name,
        steps: scriptTable.steps,
      })
      .from(scriptTable)
      .where(eq(scriptTable.workspace, workspaceId)),
  ]);

  const usages: AudioUsage[] = [];

  for (const row of campaigns) {
    if (row.voicedrop_audio === target) {
      usages.push({
        kind: "campaign_voicedrop",
        label: `${row.title} — voicemail drop`,
        campaignId: row.id,
      });
    }
    if (row.voicemail_file === target) {
      usages.push({
        kind: "campaign_voicemail",
        label: `${row.title} — voicemail greeting`,
        campaignId: row.id,
      });
    }
  }

  for (const row of numbers) {
    usages.push({
      kind: "number_inbound",
      label: `${row.friendly_name ?? row.phone_number ?? "Phone number"} — inbound greeting`,
      phoneNumber: row.phone_number ?? undefined,
    });
  }

  for (const row of queues) {
    usages.push({
      kind: "queue_hold",
      label: `${row.name} — hold music`,
      queueId: row.id,
    });
  }

  for (const row of scripts) {
    if (getScriptAudioReferences(row.steps).includes(target)) {
      usages.push({
        kind: "script_step",
        label: `${row.name} — IVR step`,
        scriptId: row.id,
      });
    }
  }

  return usages;
}
