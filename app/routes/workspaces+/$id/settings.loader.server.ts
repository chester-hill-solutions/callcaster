import { data as routeData } from "react-router";
import { getWorkspaceSettingsPageData } from "@/lib/workspace-settings-db.server";
import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth: access }) => {
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
        canManageApiKeys: settings.canManageApiKeys,
        grantableApiKeyScopes: settings.grantableApiKeyScopes,
        apiKeys: settings.apiKeys,
      },
      { headers },
    );
  },
});
