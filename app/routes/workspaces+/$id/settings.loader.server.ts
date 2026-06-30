import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { getWorkspaceSettingsPageData } from "@/lib/workspace-settings-db.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (!workspaceId) throw new Error("No workspace id found!");
  const userId = user?.id;
  if (!userId) throw new Error("No user found!");

  const settings = await getWorkspaceSettingsPageData(workspaceId, userId);

  return routeData(
    {
      workspace: settings.workspace,
      userRole: settings.userRole,
      users: settings.users,
      activeUserId: userId,
      phoneNumbers: settings.phoneNumbers,
      pendingInvites: settings.pendingInvites,
      webhook: settings.webhook,
      hasAccess: settings.hasAccess,
    },
    { headers },
  );
};
