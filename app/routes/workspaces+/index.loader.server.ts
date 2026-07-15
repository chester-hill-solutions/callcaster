import { listUserWorkspaces } from "@/lib/platform-workspace.server";
import { data as routeData } from "react-router";
import { createAuthLayoutLoader } from "@/lib/auth-layout.server";
import { requireTwoFactorEnrollmentForPrivilegedUser } from "@/lib/two-factor.server";
import { defineLoader } from "@/lib/handler.server";
import { logger } from "@/lib/logger.server";

export type WorkspaceListItem = {
  last_accessed: string | null;
  role: string;
  workspace: {
    id: string;
    name: string;
  };
};

export type WorkspacesIndexLoaderData = {
  workspaces: WorkspaceListItem[] | null;
  error: string | null;
};

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
    const { user } = layout.data;
    const headers =
      layout.init?.headers instanceof Headers
        ? layout.init.headers
        : new Headers();

    const result = await listUserWorkspaces(user.id);

    if (!result.ok) {
      logger.error("Failed to load workspaces for index", {
        userId: user.id,
        error: result.error,
      });
      return routeData(
        {
          workspaces: null,
          error: "Failed to load workspaces. Please refresh and try again.",
        } satisfies WorkspacesIndexLoaderData,
        { headers },
      );
    }

    const workspaces: WorkspaceListItem[] = result.workspaces.map((row) => ({
      last_accessed: row.last_accessed ?? null,
      role: String(row.role ?? ""),
      workspace: {
        id: row.workspace.id,
        name: row.workspace.name,
      },
    }));

    return routeData(
      {
        workspaces,
        error: null,
      } satisfies WorkspacesIndexLoaderData,
      { headers },
    );
  },
});
