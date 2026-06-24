import { loadCallLogPage } from "@/lib/call-log.server";
import { getHandsetNumberForWorkspace, getUserRole } from "@/lib/database.server";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { User } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const EMPTY_LISTENING = {
  active: false,
  token: null,
  tokenError: null,
} as const;

async function loadIncomingListeningState(args: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  userId: string;
}) {
  const { data: handsetData } = await getHandsetNumberForWorkspace({
    supabaseClient: args.supabaseClient,
    workspaceId: args.workspaceId,
  });
  const handsetNumber = handsetData?.phone_number ?? null;
  const now = new Date().toISOString();
  const { data: session } = await args.supabaseClient
    .from("handset_session")
    .select("client_identity")
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", args.userId)
    .eq("status", "active")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session?.client_identity) {
    return {
      handsetNumber,
      listening: { ...EMPTY_LISTENING },
    };
  }

  const tokenResult = await createHandsetAccessToken({
    supabaseClient: args.supabaseClient,
    workspaceId: args.workspaceId,
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
  const { supabaseClient, headers, user } = await verifyAuth(request);
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
    supabaseClient,
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

  const [{ data: workspace, error: workspaceError }, { data: campaigns, error: campaignsError }] =
    await Promise.all([
      supabaseClient
        .from("workspace")
        .select("id, name, credits")
        .eq("id", workspaceId)
        .single(),
      supabaseClient
        .from("campaign")
        .select("id, title, status")
        .eq("workspace", workspaceId)
        .order("created_at", { ascending: false }),
    ]);

  if (campaignsError) {
    logger.error("Failed to load campaigns for call log nav:", campaignsError);
  }

  if (workspaceError || !workspace) {
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
        supabaseClient,
        workspaceId,
        requestUrl: request.url,
      }),
      user
        ? loadIncomingListeningState({
            supabaseClient,
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
