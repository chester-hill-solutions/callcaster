import { data as routeData } from "react-router";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { initiateIvrBodySchema } from "@/lib/schemas/api/common";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { fetchCampaignByIdForWorkspace } from "@/lib/campaign-ivr.server";

import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { rpcGetCampaignQueue } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { normalizePhoneNumber } from "@/lib/utils";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  // Kicks off IVR dials by POSTing each queued contact to /api/ivr (which does
  // the Twilio call + db writes); this handler itself only reads the queue.
  sideEffects: ["db-read", "external"],
  handler: async ({ request, auth }) => {
    const user = auth.user;

    const parsed = initiateIvrBodySchema.safeParse(await safeParseJson(request));
    if (!parsed.success) {
      return { error: "Invalid initiate IVR payload" };
    }

    const { campaign_id, user_id, workspace_id } = parsed.data;

    await requireWorkspaceAccess({
      user,
      workspaceId: workspace_id,
    });

    try {
      await fetchCampaignByIdForWorkspace(workspace_id, campaign_id);
    } catch {
      return { error: "Campaign not found in workspace" };
    }

    const tdb = createTenantDb(workspace_id);

    const data = await rpcGetCampaignQueue(tdb, campaign_id);

    logger.debug("Campaign queue data:", data);
    for (let i = 0; i < (data?.length ?? 0); i++) {
      const contact = data[i];
      if (!contact) {
        continue;
      }
      const formData = new FormData();
      formData.append("user_id", user_id.id);
      formData.append("campaign_id", String(campaign_id));
      formData.append("workspace_id", workspace_id);
      formData.append("queue_id", String(contact.id));
      formData.append("contact_id", String(contact.contact_id));
      formData.append("caller_id", String(contact.caller_id));
      formData.append("to_number", normalizePhoneNumber(contact.phone));
      const response = await fetch(`${env.BASE_URL()}/api/ivr`, {
        body: formData,
        method: "POST",
      }).catch((fetchError) => {
        logger.error("Error initiating IVR call:", fetchError);
        return null;
      });
      if (!response) {
        continue;
      }
      const res = await response
        .json()
        .catch((parseError: unknown) => {
          logger.error("Error parsing IVR response:", parseError);
          return null;
        });
      if (response.status === 402 || res?.creditsError) {
        return routeData({ creditsError: true }, { status: 402 });
      }
    }
    return data;
  },
});
