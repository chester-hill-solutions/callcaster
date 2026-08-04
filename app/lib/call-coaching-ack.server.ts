/**
 * Acknowledge a live-coaching cue.
 *
 * Tenancy: `coaching_event` carries no workspace column, so it is not in
 * `workspace-scoped-tables.ts` and the scoped client cannot filter it. We
 * therefore mirror `call-coaching-hydration.server.ts`: gate on `call` — which
 * *is* scoped — via `createTenantDb`, and only touch the transcription table
 * once the call is proven to belong to this workspace.
 *
 * Order matters. Membership in the *claimed* workspace is checked before any
 * transcription row is read, and the tenant-scoped `call` gate is checked
 * before any row is written. The one unavoidable admin read is the cue's
 * `call_sid` pointer: an event id is the only handle the client has, and the
 * sid is the only way to reach a scoped table. That read returns no cue content
 * to the caller and a foreign / missing id is indistinguishable in the
 * response — both yield the same 404, per the repo's uniform-404 posture
 * (ADR-0004).
 *
 * Policy (deliberate): any member of the workspace, in any role, may ack any
 * cue in that workspace. There is no role gate and no agent-ownership gate.
 *
 * Lives in `app/lib/**` rather than the route because routes are barred from
 * `@/server/admin-db` by `no-restricted-imports` (ADR-0004).
 */
import { eq } from "drizzle-orm";
import { call as callTable } from "@/db/schema";
import { coaching_event } from "@/db/schema-transcription";
import { requireWorkspaceAccess } from "@/lib/workspace-membership.server";
import { createTenantDb } from "@/server/tenant-db";
import { adminDb } from "@/server/admin-db";

export type AcknowledgeCoachingCueResult =
  | { ok: true }
  | { ok: false; status: 400 | 404; error: string };

export async function acknowledgeCoachingCue({
  user,
  workspaceId,
  coachingEventId,
}: {
  user: { id: string };
  workspaceId: string | undefined;
  coachingEventId: string | undefined;
}): Promise<AcknowledgeCoachingCueResult> {
  if (!coachingEventId) {
    return { ok: false, status: 400, error: "coachingEventId is required" };
  }
  if (!workspaceId) {
    return { ok: false, status: 400, error: "workspaceId is required" };
  }

  // Membership gate first: a non-member never gets as far as a cue lookup.
  // Throws AppError(404) for non-members (uniform 404), 403 for a bad role.
  const tdb = createTenantDb(workspaceId);
  await requireWorkspaceAccess({ user: { id: user.id }, workspaceId, tdb });

  // Pointer read: `call_sid` only, nothing that could leak another tenant's cue.
  const event = await adminDb.query.coaching_event.findFirst({
    where: eq(coaching_event.id, coachingEventId),
    columns: { call_sid: true },
  });
  if (!event) {
    return { ok: false, status: 404, error: "Coaching event not found" };
  }

  // Tenancy gate: the scoped client filters `call` by workspace for us, so a
  // cue whose call belongs to another workspace misses here and is never
  // written.
  const owned = await tdb.call.findFirst({
    where: eq(callTable.sid, event.call_sid),
    columns: { sid: true },
  });
  if (!owned) {
    return { ok: false, status: 404, error: "Coaching event not found" };
  }

  await adminDb
    .update(coaching_event)
    .set({ acknowledged_at: new Date().toISOString() })
    .where(eq(coaching_event.id, coachingEventId));

  return { ok: true };
}
