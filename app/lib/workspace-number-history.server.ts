import { eq } from "drizzle-orm";
import { workspace_number, workspace_number_release } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

export type WorkspaceNumberHistoryRow = {
  id: string;
  number_id: number;
  phone_number: string | null;
  friendly_name: string | null;
  type: string;
  released_at: string;
};

function identity(id: number, createdAt: string, phone: string | null) {
  return `${id}:${Date.parse(createdAt)}:${phone ?? ""}`;
}

/** Retained rows lead; completed receipts fill history deleted by earlier app versions. */
export async function getWorkspaceNumberHistory({
  workspaceId,
  tdb = createTenantDb(workspaceId),
}: {
  workspaceId: string;
  tdb?: TenantDb;
}): Promise<WorkspaceNumberHistoryRow[]> {
  const [numbers, receipts] = await Promise.all([
    tdb.workspace_number.findMany({
      where: eq(workspace_number.status, "released"),
      columns: {
        id: true,
        created_at: true,
        phone_number: true,
        friendly_name: true,
        type: true,
        released_at: true,
      },
    }),
    tdb.workspace_number_release.findMany({
      where: eq(workspace_number_release.state, "completed"),
      columns: {
        id: true,
        number_id: true,
        number_created_at: true,
        phone_number: true,
        friendly_name: true,
        number_type: true,
        updated_at: true,
      },
    }),
  ]);
  const retained = new Set(
    numbers.map((row) => identity(row.id, row.created_at, row.phone_number)),
  );
  const history: WorkspaceNumberHistoryRow[] = numbers.map((row) => {
    if (!row.released_at)
      throw new Error("Released number has no release date");
    return {
      id: `number:${row.id}`,
      number_id: row.id,
      phone_number: row.phone_number,
      friendly_name: row.friendly_name,
      type: row.type,
      released_at: new Date(row.released_at).toISOString(),
    };
  });
  for (const row of receipts) {
    if (
      retained.has(
        identity(row.number_id, row.number_created_at, row.phone_number),
      )
    )
      continue;
    history.push({
      id: `release:${row.id}`,
      number_id: row.number_id,
      phone_number: row.phone_number,
      friendly_name: row.friendly_name,
      type: row.number_type,
      released_at: row.updated_at.toISOString(),
    });
  }
  return history.sort(
    (a, b) =>
      Date.parse(b.released_at) - Date.parse(a.released_at) ||
      a.id.localeCompare(b.id),
  );
}
