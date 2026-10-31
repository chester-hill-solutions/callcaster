import { eq } from "drizzle-orm";
import { workspace } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { createTenantDb } from "@/server/tenant-db";

/** Admin-only caller: restore access, without provisioning any provider resource. */
export async function restoreArchivedWorkspace(workspaceId: string, actorId: string) {
  return adminDb.transaction(async (tx) => {
    const [row] = await tx.select({ archivedAt: workspace.archived_at })
      .from(workspace).where(eq(workspace.id, workspaceId)).for("update");
    if (!row) return { ok: false as const, error: "Workspace not found.", status: 404 };
    if (!row.archivedAt) return { ok: true as const, restored: false };

    const tdb = createTenantDb(workspaceId, tx);
    // Workspaces archived before key revocation was added can still hold old keys.
    // Delete them before access returns; restore must never reactivate a credential.
    await tdb.workspace_api_key.delete({});
    await tx.update(workspace).set({ archived_at: null }).where(eq(workspace.id, workspaceId));
    await tdb.workspace_audit_event.insert({
      actor_type: "support", actor_id: actorId, action: "workspace.restore",
      target_type: "workspace", target_id: workspaceId, outcome: "success",
      metadata: { archivedAt: row.archivedAt.toISOString(), releasedNumbersRestored: false },
    });
    return { ok: true as const, restored: true };
  });
}
