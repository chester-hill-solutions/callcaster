import { loadCallLogPage } from "@/lib/call-log.server";
import { getHandsetNumberForWorkspace, getUserRole } from "@/lib/database.server";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { User } from "@/lib/types";
import { and, eq, gt } from "drizzle-orm";
import { handset_session as handsetSessionTable, workspace as workspaceTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { createTenantDb } from "@/server/tenant-db";

const EMPTY_LISTENING = {
  active: false,
  token: null,
  tokenError: null,
} as const;

async function loadIncomingListeningState(args: { workspaceId: string; userId: string }) {
  const tdb = createTenantDb(args.workspaceId);
  const { data: handsetData } = await getHandsetNumberForWorkspace({
    workspaceId: args.workspaceId,
  });
  const handsetNumber = handsetData?.phone_number ?? null;
  const now = new Date().toISOString();
  const session = await tdb.handset_session.findFirst({
    where: and(
      eq(handsetSessionTable.user_id, args.userId),
      eq(handsetSessionTable.status, "active"),
      gt(handsetSessionTable.expires_at, now),
    ),
    columns: { client_identity: true },
    orderBy: (row, { desc: descFn }) => [descFn(row.created_at)],
  });

  if (!session?.client_identity) {
    return {
      handsetNumber,
      listening: { ...EMPTY_LISTENING },
    };
  }

  const tokenResult = await createHandsetAccessToken({workspaceId: args.workspaceId,
    clientIdentity: session.client_identity,
  });

  return {
    handsetNumber,
    listening: {
      active: true,
      token: tokenResult.token,
      tokenError: tokenResult.error,
    },
  };
}

export type CallLogLoaderData = Awaited<ReturnType<typeof loadCallLogPage>> & {
  workspace: { id: string; name: string; credits: number } | null;
  userRole: string | null;
  campaigns: Array<{ id: number; title: string | null; status: string | null }>;
  error: string | null;
  handsetNumber: string | null;
  listening: {
    active: boolean;
    token: string | null;
    tokenError: string | null;
  };
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { headers, user } = await verifyAuth(request);
  const workspaceId = params.id;

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
        handsetNumber: null,
        listening: { ...EMPTY_LISTENING },
      } satisfies CallLogLoaderData,
      { headers, status: 400 },
    );
  }

  const userRole = await getUserRole({
    user: user,
    workspaceId,
  });

  if (!userRole?.role) {
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
        error: "You don't have access to this workspace",
        handsetNumber: null,
        listening: { ...EMPTY_LISTENING },
      } satisfies CallLogLoaderData,
      { headers, status: 403 },
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
        userRole: userRole.role,
        campaigns: campaigns ?? [],
        error: "Workspace not found",
        handsetNumber: null,
        listening: { ...EMPTY_LISTENING },
      } satisfies CallLogLoaderData,
      { headers, status: 404 },
    );
  }

  try {
    const [callLog, incomingState] = await Promise.all([
      loadCallLogPage({
        workspaceId,
        requestUrl: request.url,
      }),
      user
        ? loadIncomingListeningState({
            workspaceId,
            userId: user.id,
          })
        : Promise.resolve({
            handsetNumber: null,
            listening: { ...EMPTY_LISTENING },
          }),
    ]);

    return routeData(
      {
        ...callLog,
        workspace,
        userRole: userRole.role,
        campaigns: campaigns ?? [],
        error: null,
        handsetNumber: incomingState.handsetNumber,
        listening: incomingState.listening,
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
        userRole: userRole.role,
        campaigns: campaigns ?? [],
        error: "Failed to load call log. Please try again.",
        handsetNumber: null,
        listening: { ...EMPTY_LISTENING },
      } satisfies CallLogLoaderData,
      { headers, status: 500 },
    );
  }
};
