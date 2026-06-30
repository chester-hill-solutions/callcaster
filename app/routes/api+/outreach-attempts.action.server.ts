import { data as routeData } from "react-router";
import { safeParseJson } from "@/lib/database.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { db } from "@/server/db";
import type { ActionFunctionArgs } from "react-router";

interface OutreachAttemptRequest {
  campaign_id: number | string;
  contact_id: number | string;
  queue_id: number | string;
}

export const action = async ({ request }: ActionFunctionArgs) => {

    const auth = await requireJsonAuth(request);
    if (auth instanceof Response) return auth;
    const { headers } = await getSession(request);
    const user = auth.user;
    const { campaign_id, contact_id, queue_id }: OutreachAttemptRequest =
      await safeParseJson(request);

    try {
      const data = await rpcCreateOutreachAttempt(db, {
        contactId: Number(contact_id),
        campaignId: Number(campaign_id),
        userId: user?.id ?? "",
        workspaceId: "",
        queueId: Number(queue_id),
      });
      return routeData(data, { headers });
    } catch (error) {
      return routeData({ error }, { headers });
    }
}
