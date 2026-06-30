import { data as routeData, redirect, type LoaderFunctionArgs } from "react-router";
import type { Params } from "react-router";

import { getSession } from "@/lib/auth.server";
import { env as envUtil } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  listUserWorkspaceSummaries,
  loadUserWithInvites,
} from "@/lib/workspace-members-db.server";
import type { ENV, User, WorkspaceData, WorkspaceInvite } from "@/lib/types";

export type RootLoaderData = {
  env: ENV;
  session: { token: string } | null;
  workspaces: WorkspaceData[] | null;
  user: (User & { workspace_invite: WorkspaceInvite[] }) | null;
  params: Params<string>;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const env: ENV = {
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

  const { session, user: authUser, headers } = await getSession(request);
  if (!authUser) {
    return routeData(
      {
        env,
        session: null,
        workspaces: null,
        user: null,
        params,
      },
      { headers },
    );
  }
  const userData = await loadUserWithInvites(authUser.id);
  const workspaces = await listUserWorkspaceSummaries(authUser.id);

  return routeData(
    {
      env,
      session: session ? { token: session.token } : null,
      workspaces: workspaces as WorkspaceData[] | null,
      user: userData as (User & { workspace_invite: WorkspaceInvite[] }) | null,
      params,
    },
    { headers },
  );
};
