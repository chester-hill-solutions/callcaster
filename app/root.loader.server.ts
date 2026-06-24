import { data as routeData, redirect, type LoaderFunctionArgs } from "react-router";
import type { Params } from "react-router";
import type { Session } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase.server";
import { env as envUtil } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import type { ENV, User, WorkspaceData, WorkspaceInvite } from "@/lib/types";

export type RootLoaderData = {
  env: ENV;
  session: Session | null;
  workspaces: WorkspaceData[] | null;
  user: (User & { workspace_invite: WorkspaceInvite[] }) | null;
  params: Params<string>;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const env: ENV = {
    SUPABASE_URL: envUtil.SUPABASE_URL(),
    SUPABASE_KEY: envUtil.SUPABASE_PUBLISHABLE_KEY(),
    BASE_URL: envUtil.BASE_URL(),
  };

  const url = new URL(request.url);
  const qParam = url.searchParams.get("q");

  if (qParam) {
    try {
      const decoded = atob(qParam);
      const [contactId, surveyId] = decoded.split(":");

      if (contactId && surveyId) {
        return redirect(`/survey/${surveyId}?contact=${contactId}`);
      }
    } catch (error) {
      logger.error("Failed to decode survey link:", error);
    }
  }

  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = await supabase.auth.getUser();
  if (!user.data.user) {
    return routeData(
      {
        env,
        session,
        workspaces: null,
        user: null,
        params,
      },
      { headers },
    );
  }
  const { data: userData, error: userError } = await supabase
    .from("user")
    .select(`*, workspace_invite(workspace(id, name))`)
    .eq("id", user.data.user.id)
    .single();

  const { data: workspaceData, error: workspacesError } = await supabase
    .from("workspace_users")
    .select("workspace ( id, name )")
    .eq("user_id", user.data.user.id)
    .order("last_accessed", { ascending: false });
  if (workspacesError || userError) {
    logger.error("Error loading workspaces or user data", {
      workspacesError,
      userError,
    });
  }
  const workspaces = workspaceData?.map((data) => data.workspace);

  return routeData(
    {
      env,
      session,
      workspaces,
      user: userData,
      params,
    },
    { headers },
  );
};
