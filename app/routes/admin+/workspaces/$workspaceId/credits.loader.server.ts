import { data as routeData } from "react-router";
import { createTenantDb } from "@/server/tenant-db";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineLoader } from "@/lib/handler.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { LEDGER_ACTIVITY_COLUMNS } from "@/lib/transaction-history.server";

/** Ledger rows shown on the Credits tab, newest first. */
const RECENT_TRANSACTION_LIMIT = 10;

export type AdminCreditsRecentTransaction = {
  id: number;
  created_at: string;
  type: string;
  amount: number;
  note: string | null;
  idempotency_key: string | null;
};

export const loader = defineLoader({
  auth: adminRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return routeData({ error: "Workspace ID is required" }, { status: 400 });
    }
    const { headers } = auth;

    const [workspace, balance] = await Promise.all([
      getWorkspaceById(workspaceId),
      getWorkspaceCreditsBalance(workspaceId),
    ]);

    if (!workspace) {
      return routeData({ error: "Workspace not found" }, { status: 404, headers });
    }

    const tdb = createTenantDb(workspaceId);
    const recent = await tdb.transaction_history.findMany({
      columns: LEDGER_ACTIVITY_COLUMNS,
      orderBy: (row, { desc: descFn }) => [descFn(row.created_at)],
      limit: RECENT_TRANSACTION_LIMIT,
    });

    return routeData(
      {
        workspace: { id: workspace.id, name: workspace.name },
        balance: balance ?? 0,
        recentTransactions: recent as AdminCreditsRecentTransaction[],
        // Per-render nonce: a retried submit of the same form reuses this value,
        // so the ledger idempotency key credits exactly once.
        nonce: crypto.randomUUID(),
      },
      { headers },
    );
  },
});