import { listUserWorkspaces } from "@/lib/platform-workspace.server";
import { data as routeData } from "react-router";
import {
  createAuthLayoutLoader,
} from "@/lib/auth-layout.server";
import { requireTwoFactorEnrollmentForPrivilegedUser } from "@/lib/two-factor.server";
import { defineLoader } from "@/lib/handler.server";

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

const authLayoutLoader = createAuthLayoutLoader({
  onAuthenticated: async ({ user, request }) => {
    await requireTwoFactorEnrollmentForPrivilegedUser({
      userId: user.id,
      request,
    });
    return null;
  },
});

export const loader = defineLoader({
  auth: (args) => authLayoutLoader(args),
  sideEffects: ["db-read"],
  handler: async ({ auth: layout }) => {
    const { user, userId } = layout.data;
    const headers =
      layout.init?.headers instanceof Headers
        ? layout.init.headers
        : new Headers();

    const result = await listUserWorkspaces(user.id);

    if (!result.ok) {
      return routeData(
        {
          workspaces: null,
          userId,
          error: result.error,
        } satisfies LoaderData,
        { headers },
      );
    }

    return routeData(
      {
        workspaces: result.workspaces as WorkspaceUser[],
        userId,
        error: null,
      } satisfies LoaderData,
      { headers },
    );
  },
});
