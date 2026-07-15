import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { loadCallLogPage } from "@/lib/call-log.server";
import { logger } from "@/lib/logger.server";
import { data as routeData } from "react-router";
import { defineLoader } from "@/lib/handler.server";
import { eq } from "drizzle-orm";
import { workspace as workspaceTable } from "@/db/schema";
// workspace is the global tenancy root table; tdb cannot scope it.
// eslint-disable-next-line no-restricted-imports
import { adminDb } from "@/server/admin-db";
import { createTenantDb } from "@/server/tenant-db";

export type CallLogLoaderData = Awaited<ReturnType<typeof loadCallLogPage>> & {
  workspace: { id: string; name: string; credits: number } | null;
  userRole: string | null;
  campaigns: Array<{ id: number; title: string | null; status: string | null }>;
  error: string | null;
};

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    const { headers, workspaceId, userRole } = auth;

    if (!workspaceId) {
      return routeData(
        {
          rows: [],
          filters: {
            callcasterNumber: "",
            otherNumber: "",
            direction: "all",
            disposition: "",
            agentUserId: "",
            sortKey: "date_created",
            sortDirection: "desc",
            page: 1,
            pageSize: 25,
          },
          workspaceNumbers: [],
          agents: [],
          pagination: { currentPage: 1, totalPages: 0, totalCount: 0, pageSize: 25 },
          workspace: null,
          userRole: null,
          campaigns: [],
          error: "Workspace ID is required",
        } satisfies CallLogLoaderData,
        { headers, status: 400 },
      );
    }

    const tdb = createTenantDb(workspaceId);
    const [workspaceRow, campaigns] = await Promise.all([
      adminDb
        .select({
          id: workspaceTable.id,
          name: workspaceTable.name,
          credits: workspaceTable.credits,
        })
        .from(workspaceTable)
        .where(eq(workspaceTable.id, workspaceId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      tdb.campaign.findMany({
        columns: { id: true, title: true, status: true },
        orderBy: (campaign, { desc: descFn }) => [descFn(campaign.created_at)],
      }),
    ]);

    const workspace = workspaceRow;

    if (!workspace) {
      return routeData(
        {
          rows: [],
          filters: {
            callcasterNumber: "",
            otherNumber: "",
            direction: "all",
            disposition: "",
            agentUserId: "",
            sortKey: "date_created",
            sortDirection: "desc",
            page: 1,
            pageSize: 25,
          },
          workspaceNumbers: [],
          agents: [],
          pagination: { currentPage: 1, totalPages: 0, totalCount: 0, pageSize: 25 },
          workspace: null,
          userRole,
          campaigns: campaigns ?? [],
          error: "Workspace not found",
        } satisfies CallLogLoaderData,
        { headers, status: 404 },
      );
    }

    try {
      const callLog = await loadCallLogPage({
        workspaceId,
        requestUrl: url.href,
      });

      return routeData(
        {
          ...callLog,
          workspace,
          userRole,
          campaigns: campaigns ?? [],
          error: null,
        } satisfies CallLogLoaderData,
        { headers },
      );
    } catch (error) {
      logger.error("Failed to load call log:", error);
      return routeData(
        {
          rows: [],
          filters: {
            callcasterNumber: "",
            otherNumber: "",
            direction: "all",
            disposition: "",
            agentUserId: "",
            sortKey: "date_created",
            sortDirection: "desc",
            page: 1,
            pageSize: 25,
          },
          workspaceNumbers: [],
          agents: [],
          pagination: { currentPage: 1, totalPages: 0, totalCount: 0, pageSize: 25 },
          workspace,
          userRole,
          campaigns: campaigns ?? [],
          error: "Failed to load call log. Please try again.",
        } satisfies CallLogLoaderData,
        { headers, status: 500 },
      );
    }
  },
});
