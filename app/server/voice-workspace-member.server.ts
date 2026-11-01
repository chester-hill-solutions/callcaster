import { eq } from "drizzle-orm";
import { user, workspace } from "@/db/schema";
import { createTenantDb } from "./tenant-db";
import { getUserRole, WORKSPACE_MEMBERSHIP_ROLES } from "@/lib/workspace-membership.server";
import { voiceAudioRefusal } from "@/lib/voice-audio-connection";
import type { CreditTransaction } from "./outbound-credit-reservations.server";

export async function lockVoiceWorkspaceMember(tx: CreditTransaction, args: { workspaceId: string; userId: string }, allowDisabledWorkspace = false) {
  const [owner] = await tx.select().from(workspace).where(eq(workspace.id, args.workspaceId)).for("no key update");
  if (!owner || owner.archived_at) return voiceAudioRefusal("workspace_not_found");
  if (owner.disabled && !allowDisabledWorkspace) return voiceAudioRefusal("workspace_unavailable");
  const tdb = createTenantDb(args.workspaceId, tx);
  const membership = await getUserRole({ user: { id: args.userId }, workspaceId: args.workspaceId, tdb });
  const [actor] = await tx.select({ access: user.access_level, numbers: user.verified_audio_numbers }).from(user).where(eq(user.id, args.userId));
  if (!actor || actor.access === "disabled" || !membership || !WORKSPACE_MEMBERSHIP_ROLES.some((r) => r === membership.role))
    return voiceAudioRefusal("agent_not_found");
  return { ok: true as const, owner, actor, tdb };
}
