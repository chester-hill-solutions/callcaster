import {
  buildQueuedQueueUpdate,
  isAssignedToUser,
} from "@/lib/queue-status";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { campaign_id } = params;

  const { supabaseClient, headers, user } = await verifyAuth(request);
  if (!user || !campaign_id) {
    throw redirect("/signin");
  }
  const { data: assignedRows, error: assignedRowsError } = await supabaseClient
    .from("campaign_queue")
    .select("id, status, dequeued_at, assigned_to_user_id")
    .eq("campaign_id", parseInt(campaign_id))
    .is("dequeued_at", null);

  if (assignedRowsError) {
    logger.error("Error fetching assigned campaign queue rows:", assignedRowsError);
    throw assignedRowsError;
  }

  const assignedIds = (assignedRows ?? [])
    .filter((row) => isAssignedToUser(row, user.id))
    .map((row) => row.id);

  if (assignedIds.length === 0) {
    return redirect("/workspaces", { headers });
  }

  const update = await supabaseClient
    .from("campaign_queue")
    .update(buildQueuedQueueUpdate())
    .in("id", assignedIds)
    .select();
  if (update.error) {
    logger.error("Error updating campaign queue:", update.error);
    throw update.error;
  }
  return redirect("/workspaces");
};
