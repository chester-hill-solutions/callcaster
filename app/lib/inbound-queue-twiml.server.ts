import { findInboundQueueInWorkspace } from "@/lib/inbound-queue-db.server";
import type { TwimlResponse } from "@/lib/twilio-twiml.server";
import { makeQueueName } from "../../shared/acd-utils";

export async function appendInboundQueueTwiml(args: {
  twiml: TwimlResponse;
  workspaceId: string;
  queueId: number;
  callSid: string;
  callerNumber: string;
  baseUrl: string;
}): Promise<void> {
  if (!Number.isSafeInteger(args.queueId) || args.queueId <= 0 ||
      !(await findInboundQueueInWorkspace(args.workspaceId, args.queueId))) {
    args.twiml.hangup();
    return;
  }

  const queueName = makeQueueName(args.queueId);
  const waitUrl = new URL(`${args.baseUrl.replace(/\/$/, "")}/api/acd-router`);
  waitUrl.search = new URLSearchParams({
    queue_id: String(args.queueId), CallSid: args.callSid, From: args.callerNumber,
  }).toString();
  const action = new URL(`${args.baseUrl.replace(/\/$/, "")}/api/acd-router/complete`);
  // ACD creates the entry on its wait callback; completion resolves it by call and queue.
  action.search = new URLSearchParams({ queue_name: queueName }).toString();
  args.twiml.enqueue({ waitUrl: waitUrl.href, action: action.href }, queueName);
}
