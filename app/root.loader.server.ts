import { data as routeData, redirect, type LoaderFunctionArgs, Params } from "react-router";

import { getSession } from "@/lib/auth.server";
import { logger } from "@/lib/logger.server";
import {
  listUserWorkspaceSummaries,
  loadUserWithInvites,
} from "@/lib/workspace-members-db.server";

export type RootNavbarInvite = {
  id: string;
};

export type RootNavbarUser = {
  id: string;
  first_name: string | null;
  username: string | null;
  workspace_invite: RootNavbarInvite[];
};

export type RootWorkspaceSummary = {
  id: string;
  name: string;
  role: string;
  /** Present for Admin+ members only; null hides the navbar credit readout. */
  credits: number | null;
};

export type RootLoaderData = {
  isSignedIn: boolean;
  workspaces: RootWorkspaceSummary[] | null;
  user: RootNavbarUser | null;
  params: Params<string>;
};

function toNavbarUser(
  userData: NonNullable<Awaited<ReturnType<typeof loadUserWithInvites>>>,
): RootNavbarUser {
  return {
    id: userData.id,
    first_name: userData.first_name ?? null,
    username: userData.username ?? null,
    workspace_invite: userData.workspace_invite.map((invite) => ({
      id: invite.id,
    })),
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
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

  const { user: authUser, headers } = await getSession(request);
  if (!authUser) {
    return routeData(
      {
        isSignedIn: false,
        workspaces: null,
        user: null,
        params,
      } satisfies RootLoaderData,
      { headers },
    );
  }

  try {
    const [userData, workspaces] = await Promise.all([
      loadUserWithInvites(authUser.id),
      listUserWorkspaceSummaries(authUser.id),
    ]);

    return routeData(
      {
        isSignedIn: true,
        workspaces,
        user: userData ? toNavbarUser(userData) : null,
        params,
      } satisfies RootLoaderData,
      { headers },
    );
  } catch (error) {
    logger.error("Error loading workspaces or user data", error);
    return routeData(
      {
        isSignedIn: true,
        workspaces: null,
        user: null,
        params,
      } satisfies RootLoaderData,
      { headers },
    );
  }
};
