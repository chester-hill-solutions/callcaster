import { consumeInvitationFlash, type InvitationFlash } from "@/lib/invitation-flash.server";
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
  flash: InvitationFlash | null;
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

function withClearedFlash(response: Response, clearCookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", clearCookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const loader = defineLoader({
  auth: async (args) => {
    const feedback = await consumeInvitationFlash(args.request);
    try {
      const layout = await authLayoutLoader(args);
      if (layout instanceof Response) return withClearedFlash(layout, feedback.clearCookie);
      return { layout, feedback };
    } catch (error) {
      if (error instanceof Response) throw withClearedFlash(error, feedback.clearCookie);
      logger.error("Failed to authenticate workspace index", error);
      return Response.json(
        { workspaces: null, error: "Failed to load workspaces. Please refresh and try again.", flash: null } satisfies WorkspacesIndexLoaderData,
        { status: 500, headers: { "Set-Cookie": feedback.clearCookie } },
      );
    }
  },
  sideEffects: ["db-read"],
  handler: async ({ auth: { layout, feedback } }) => {
    const { user } = layout.data;
    const headers = new Headers(layout.init?.headers);
    headers.append("Set-Cookie", feedback.clearCookie);

    try {
      const result = await listUserWorkspaces(user.id);
      if (!result.ok) throw new Error(result.error);
      const workspaces: WorkspaceListItem[] = result.workspaces.map((row) => ({
        last_accessed: row.last_accessed ?? null,
        role: String(row.role ?? ""),
        workspace: { id: row.workspace.id, name: row.workspace.name },
      }));
      return routeData(
        { workspaces, error: null, flash: feedback.flash } satisfies WorkspacesIndexLoaderData,
        { headers },
      );
    } catch (error) {
      if (error instanceof Response) throw withClearedFlash(error, feedback.clearCookie);
      logger.error("Failed to load workspaces for index", { userId: user.id, error });
      return routeData(
        { workspaces: null, error: "Failed to load workspaces. Please refresh and try again.", flash: feedback.flash } satisfies WorkspacesIndexLoaderData,
        { headers, status: 500 },
      );
    }
  },
});
