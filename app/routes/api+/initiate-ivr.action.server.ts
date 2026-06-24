import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import { initiateIvrBodySchema } from "@/lib/schemas/api/common";
import { getAuthSupabaseClient, requireJsonAuth } from "@/lib/api-auth.server";

import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber } from "@/lib/utils";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const parsed = initiateIvrBodySchema.safeParse(await safeParseJson(request));
  if (!parsed.success) {
    return { error: "Invalid initiate IVR payload" };
  }

  const { campaign_id, user_id, workspace_id } = parsed.data;
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  const supabase = getAuthSupabaseClient(auth);
  const user = auth.user;

  await requireWorkspaceAccess({ supabaseClient: supabase,
    user,
    workspaceId: workspace_id,
  });

  const { data: campaign } = await supabase
    .from("campaign")
    .select("id")
    .eq("id", campaign_id)
    .eq("workspace", workspace_id)
    .maybeSingle();

  if (!campaign) {
    return { error: "Campaign not found in workspace" };
  }

  const { data, error } = await supabase.rpc("get_campaign_queue", {
    campaign_id_pro: campaign_id,
  });
  if (error) throw error;

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
    const res = await fetch(`${env.BASE_URL()}/api/ivr`, {
      body: formData,
      method: "POST",
    })
      .then((response) => response.json())
      .catch((fetchError) => {
        logger.error("Error initiating IVR call:", fetchError);
        return null;
      });
    if (res?.creditsError) {
      return {
        creditsError: true,
      };
    }
  }
  return data;
};
