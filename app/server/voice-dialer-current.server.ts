import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { workspace_voice_dialer_intent as intents } from "@/db/schema";
import { voiceDialerCurrentSchema } from "@/lib/schemas/api/voice-dialer-stop";
import type { TenantDb } from "./tenant-db";

/** The caller holds the workspace fence used by Start and Stop admission. */
export async function readCurrentDialer(tdb: TenantDb, userId: string) {
  const rows = await tdb.workspace_voice_dialer_intent.findMany({ where: and(eq(intents.user_id, userId),
    or(and(isNotNull(intents.reservation_id), isNull(intents.retired_at), isNull(intents.stop_requested_at)),
      and(isNotNull(intents.stop_requested_at), isNull(intents.stopped_at)))), limit: 2 });
  if (rows.length > 1) return { ok: false as const };
  const row = rows[0];
  if (!row) return { ok: true as const, dialer: null };
  const parsed = voiceDialerCurrentSchema.safeParse({ workspace_id: row.workspace, user_id: row.user_id,
    campaign_id: row.campaign_id, intent_id: row.intent_id, conference_id: row.conference_id,
    dialer_state: row.stop_requested_at ? "stopping" : "active" });
  return parsed.success ? { ok: true as const, dialer: parsed.data } : { ok: false as const };
}
