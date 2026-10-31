import { and, eq, exists, isNull } from "drizzle-orm";
import { workspace, workspace_api_key } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { createTenantDb } from "@/server/tenant-db";

/** Keep the active-workspace predicate inside the membership query. */
export function activeWorkspaceExists(workspaceId: string) {
  return exists(adminDb.select({ id: workspace.id }).from(workspace).where(and(
    eq(workspace.id, workspaceId), isNull(workspace.archived_at),
  )));
}

/** Archive and mint share this row lock, so no key can survive an archive. */
export async function archiveWorkspaceById(workspaceId: string, archivedAt: Date) {
  return adminDb.transaction(async (tx) => {
    const [row] = await tx.select({ archivedAt: workspace.archived_at })
      .from(workspace).where(eq(workspace.id, workspaceId)).for("update");
    if (!row) return null;

    const revoked = await tx.delete(workspace_api_key)
      .where(eq(workspace_api_key.workspace_id, workspaceId))
      .returning({ id: workspace_api_key.id });
    const timestamp = row.archivedAt ?? archivedAt;
    await tx.update(workspace).set({ archived_at: timestamp }).where(eq(workspace.id, workspaceId));
    return { id: workspaceId, archivedAt: timestamp, revokedApiKeys: revoked.length };
  });
}

export async function insertWorkspaceApiKeyRow(args: {
  workspaceId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: readonly string[];
  expiresAt: string;
}) {
  return adminDb.transaction(async (tx) => {
    const [row] = await tx.select({ archivedAt: workspace.archived_at })
      .from(workspace).where(eq(workspace.id, args.workspaceId)).for("update");
    if (!row || row.archivedAt) return null;

    const [key] = await createTenantDb(args.workspaceId, tx).workspace_api_key.insert({
      id: crypto.randomUUID(), name: args.name.trim(),
      key_prefix: args.keyPrefix, key_hash: args.keyHash,
      created_by: args.userId, created_at: new Date().toISOString(),
      scopes: [...args.scopes], expires_at: args.expiresAt,
    });
    return key ?? null;
  });
}
