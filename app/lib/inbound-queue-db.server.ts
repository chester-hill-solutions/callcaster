import { and, eq, inArray } from "drizzle-orm";
import {
  inbound_queue as inboundQueueTable,
  inbound_queue_member as inboundQueueMemberTable,
} from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

export async function loadInboundQueueSettings(
  workspaceId: string,
  tdbIn?: TenantDb,
) {
  const tdb = tdbIn ?? createTenantDb(workspaceId);

  const queues = await tdb.inbound_queue.findMany({
    orderBy: (queue, { asc: ascFn }) => [ascFn(queue.name)],
  });

  const queueIds = queues.map((queue) => queue.id);
  const members =
    queueIds.length === 0
      ? []
      : await tdb.inbound_queue_member.findMany({
          where: inArray(inboundQueueMemberTable.queue_id, queueIds),
        });

  const numbers = await tdb.workspace_number.findMany({
    columns: {
      id: true,
      phone_number: true,
      friendly_name: true,
      inbound_queue_id: true,
    },
  });

  return { queues, members, numbers };
}

export async function createInboundQueue(args: {
  workspaceId: string;
  name: string;
  description?: string | null;
  hold_audio?: string | null;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const now = new Date().toISOString();
  const [queue] = await tdb.inbound_queue.insert({
    name: args.name,
    description: args.description ?? null,
    hold_audio: args.hold_audio ?? null,
    created_at: now,
    updated_at: now,
  });
  return queue;
}

export async function updateInboundQueue(args: {
  workspaceId: string;
  id: number;
  updates: {
    name?: string;
    description?: string | null;
    hold_audio?: string | null;
  };
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (args.updates.name !== undefined) set.name = args.updates.name;
  if (args.updates.description !== undefined) set.description = args.updates.description;
  if (args.updates.hold_audio !== undefined) set.hold_audio = args.updates.hold_audio;

  const rows = await tdb.inbound_queue.update({
    set,
    where: eq(inboundQueueTable.id, args.id),
  });
  return rows[0] ?? null;
}

export async function deleteInboundQueue(args: {
  workspaceId: string;
  id: number;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  await tdb.inbound_queue.delete({
    where: eq(inboundQueueTable.id, args.id),
  });
}

export async function addInboundQueueMember(args: {
  workspaceId: string;
  queueId: number;
  userId: string;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const now = new Date().toISOString();
  await tdb.inbound_queue_member.insert({
    queue_id: args.queueId,
    user_id: args.userId,
    created_at: now,
  });
}

export async function removeInboundQueueMember(args: {
  workspaceId: string;
  queueId: number;
  userId: string;
  tdb?: TenantDb;
}) {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  await tdb.inbound_queue_member.delete({
    where: and(
      eq(inboundQueueMemberTable.queue_id, args.queueId),
      eq(inboundQueueMemberTable.user_id, args.userId),
    ),
  });
}
