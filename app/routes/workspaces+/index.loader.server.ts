import { listUserWorkspaces } from "@/lib/platform-workspace.server";
import { data as routeData, redirect } from "react-router";
import { getSession } from "@/lib/auth.server";
import { requireTwoFactorEnrollmentForPrivilegedUser } from "@/lib/two-factor.server";
import type { LoaderFunctionArgs } from "react-router";

interface Workspace {
  id: string;
  name: string;
}

interface WorkspaceUser {
  last_accessed: string;
  role: string;
  workspace: Workspace;
}

interface LoaderData {
  workspaces: WorkspaceUser[] | null;
  userId: string;
  error: string | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { user, headers } = await getSession(request);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(
      `/signin?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`,
    );
  }

  await requireTwoFactorEnrollmentForPrivilegedUser({
    userId: user.id,
    request,
  });

  const result = await listUserWorkspaces(user.id);

  if (!result.ok) {
    return routeData(
      {
        workspaces: null,
        userId: user.id,
        error: result.error,
      } satisfies LoaderData,
      { headers },
    );
  }

  return routeData(
    {
      workspaces: result.workspaces as WorkspaceUser[],
      userId: user.id,
      error: null,
    } satisfies LoaderData,
    { headers },
  );
};
