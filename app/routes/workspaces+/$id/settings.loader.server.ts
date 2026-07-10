import { data as routeData } from "react-router";
import { getWorkspaceSettingsPageData } from "@/lib/workspace-settings-db.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const access = await requireWorkspaceLoaderContext(request, params.id, { context });
  if (!access.ok) {
    return access.response;
  }

  const { headers, user, workspaceId } = access.ctx;
  const settings = await getWorkspaceSettingsPageData(workspaceId, user.id);

  return routeData(
    {
      workspace: settings.workspace,
      userRole: settings.userRole,
      users: settings.users,
      activeUserId: user.id,
      phoneNumbers: settings.phoneNumbers,
      pendingInvites: settings.pendingInvites,
      webhook: settings.webhook,
      hasAccess: settings.hasAccess,
      apiKeys: settings.apiKeys,
    },
    { headers },
  );
};
