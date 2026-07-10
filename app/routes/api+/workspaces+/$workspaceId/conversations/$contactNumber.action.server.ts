import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  markMessageAsDeliveredBySid,
  markReceivedMessagesAsDeliveredForPhone,
} from "@/lib/message-db.server";
import { resolveDataPlaneAuth } from "@/lib/platform-data.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params, context }: ActionFunctionArgs) {
  const workspaceId = params.workspaceId;
  const contactNumber = params.contactNumber;
  if (!workspaceId || !contactNumber) {
    return jsonError("workspaceId and contactNumber are required", 400);
  }

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }
  getDataPlaneRouteContext(context, workspaceId);

  const decodedContactNumber = decodeURIComponent(contactNumber);
  let messageSid: string | undefined;
  try {
    const body = (await request.json()) as { sid?: string };
    messageSid = body.sid;
  } catch {
    messageSid = undefined;
  }

  try {
    if (messageSid) {
      await markMessageAsDeliveredBySid(workspaceId, messageSid);
    } else {
      await markReceivedMessagesAsDeliveredForPhone(workspaceId, decodedContactNumber);
    }
    return jsonResponse({ ok: true }, 200);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to mark conversation read",
      500,
    );
  }
}
