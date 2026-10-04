import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import * as authSchema from "@/db/auth-schema";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const { clientRef } = vi.hoisted(() => ({ clientRef: { current: null as unknown } }));
vi.mock("@/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db")>()),
  get db() {
    return drizzle(clientRef.current as postgres.Sql, { schema: { ...schema, ...authSchema } });
  },
}));

// No URL means no real-row proof. The compose runner supplies DATABASE_URL.
const describeDb = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const foreignWorkspaceId = randomUUID();
const workspaceNumber = "+15559990000";
const phone = (i: number) => `+1555${String(i).padStart(7, "0")}`;

describeDb("complete workspace unread count (#2045)", () => {
  let client: postgres.Sql;
  let helpers: typeof import("@/lib/database/workspace-conversations.server");

  beforeAll(async () => {
    client = postgres(databaseUrl!, { prepare: false, max: 2, connect_timeout: 5 });
    clientRef.current = client;
    helpers = await import("@/lib/database/workspace-conversations.server");
    await client`INSERT INTO public.workspace (id, name, credits, twilio_data, feature_flags, disabled)
      VALUES (${workspaceId}::uuid, 'Unread fixture', 0, '{}', '{}', false),
             (${foreignWorkspaceId}::uuid, 'Foreign unread fixture', 0, '{}', '{}', false)`;
    await client`INSERT INTO public.workspace_number (workspace, phone_number, type)
      VALUES (${workspaceId}::uuid, ${workspaceNumber}, 'local'),
             (${foreignWorkspaceId}::uuid, '+15559990001', 'local')`;
    // 105 conversations, one unread each. Conversation 104 is beyond the
    // newest 100; it has two more unread messages, for a known total of 107.
    for (let i = 0; i < 105; i++) {
      await client`INSERT INTO public.message (sid, workspace, "from", "to", direction, status, date_created)
        VALUES (${randomUUID()}, ${workspaceId}::uuid, ${phone(i)}, ${workspaceNumber},
                'inbound', 'received', ${new Date(Date.UTC(2026, 9, 4, 12, 0, -i)).toISOString()})`;
    }
    for (let i = 0; i < 2; i++) {
      await client`INSERT INTO public.message (sid, workspace, "from", "to", direction, status, date_created)
        VALUES (${randomUUID()}, ${workspaceId}::uuid, ${phone(104)}, ${workspaceNumber},
                'inbound', 'received', '2026-10-04T11:00:00Z')`;
      await client`INSERT INTO public.message (sid, workspace, "from", "to", direction, status, date_created)
        VALUES (${randomUUID()}, ${foreignWorkspaceId}::uuid, ${phone(i)}, ${workspaceNumber},
                'inbound', 'received', '2026-10-04T12:00:00Z')`;
    }
  });

  afterAll(async () => {
    if (!client) return;
    await client`DELETE FROM public.message WHERE workspace IN (${workspaceId}::uuid, ${foreignWorkspaceId}::uuid)`;
    await client`DELETE FROM public.workspace_number WHERE workspace IN (${workspaceId}::uuid, ${foreignWorkspaceId}::uuid)`;
    await client`DELETE FROM public.workspace WHERE id IN (${workspaceId}::uuid, ${foreignWorkspaceId}::uuid)`;
    clientRef.current = null;
    await client.end({ timeout: 2 });
  });

  test("includes the oldest conversation and equals the complete real per-conversation sum", async () => {
    expect(await helpers.readWorkspaceUnreadConversationCount(workspaceId)).toBe(107);
    expect(await helpers.getWorkspaceUnreadConversationCount(workspaceId)).toBe(107);
    const full = await helpers.fetchConversationSummary(workspaceId, null, { limit: 200, enrichContacts: false });
    expect(full.chatsError).toBeNull();
    expect(full.chats).toHaveLength(105);
    expect(full.chats.reduce((sum, row) => sum + row.unread_count, 0)).toBe(107);
    expect(full.chats.find(row => row.contact_phone === phone(104))?.unread_count).toBe(3);
    const first = await helpers.fetchConversationSummary(workspaceId, null, { limit: 100, enrichContacts: false });
    expect(first.chats).toHaveLength(100);
    expect(first.chats.reduce((sum, row) => sum + row.unread_count, 0)).toBe(100);
  });

  test("scopes the count by workspace even when foreign rows use the owned phone", async () => {
    expect(await helpers.readWorkspaceUnreadConversationCount(foreignWorkspaceId)).toBe(2);
    expect(await helpers.readWorkspaceUnreadConversationCount(workspaceId)).toBe(107);
  });

  test("excludes read, outbound, failed, undated and unidentifiable messages", async () => {
    const controls = [
      { direction: "inbound", status: "delivered", from: phone(200), date: "2026-10-04T12:00:00Z" },
      { direction: "outbound-api", status: "received", from: phone(201), date: "2026-10-04T12:00:00Z" },
      { direction: "inbound", status: "failed", from: phone(202), date: "2026-10-04T12:00:00Z" },
      { direction: "inbound", status: "received", from: phone(203), date: null },
      { direction: "inbound", status: "received", from: null, date: "2026-10-04T12:00:00Z" },
      { direction: "inbound", status: "received", from: "   ", date: "2026-10-04T12:00:00Z" },
    ];
    const sids: string[] = [];
    try {
      for (const control of controls) {
        const sid = randomUUID(); sids.push(sid);
        await client`INSERT INTO public.message (sid, workspace, "from", "to", direction, status, date_created)
          VALUES (${sid}, ${workspaceId}::uuid, ${control.from}, ${workspaceNumber},
                  ${control.direction}::public.message_direction, ${control.status}::public.message_status,
                  ${control.date}::timestamptz)`;
      }
      expect(await helpers.readWorkspaceUnreadConversationCount(workspaceId)).toBe(107);
    } finally {
      await client`DELETE FROM public.message WHERE workspace = ${workspaceId}::uuid AND sid IN ${client(sids)}`;
    }
  });

  test("uses workspace-number membership for the same conversation identity as the pills", async () => {
    const sid = randomUUID();
    try {
      await client`INSERT INTO public.message (sid, workspace, "from", "to", direction, status, date_created)
        VALUES (${sid}, ${workspaceId}::uuid, ${workspaceNumber}, ${phone(104)},
                'inbound', 'received', '2026-10-04T11:00:00Z')`;
      expect(await helpers.readWorkspaceUnreadConversationCount(workspaceId)).toBe(108);
      const full = await helpers.fetchConversationSummary(workspaceId, null, { limit: 200, enrichContacts: false });
      expect(full.chats).toHaveLength(105);
      expect(full.chats.find(row => row.contact_phone === phone(104))?.unread_count).toBe(4);
    } finally {
      await client`DELETE FROM public.message WHERE workspace = ${workspaceId}::uuid AND sid = ${sid}`;
    }
  });

  test("preserves the existing list definition for legacy phone text without digits", async () => {
    const sid = randomUUID();
    try {
      // The existing SQL normalizer gives nonblank nondigit text an empty
      // key. This issue preserves that list definition rather than changing
      // per-conversation counts as part of removing the page cap.
      await client`INSERT INTO public.message (sid, workspace, "from", "to", direction, status, date_created)
        VALUES (${sid}, ${workspaceId}::uuid, 'no phone digits', ${workspaceNumber},
                'inbound', 'received', '2026-10-04T12:00:00Z')`;
      const full = await helpers.fetchConversationSummary(workspaceId, null, { limit: 200, enrichContacts: false });
      expect(full.chats.reduce((sum, row) => sum + row.unread_count, 0)).toBe(108);
      expect(await helpers.readWorkspaceUnreadConversationCount(workspaceId)).toBe(108);
    } finally {
      await client`DELETE FROM public.message WHERE workspace = ${workspaceId}::uuid AND sid = ${sid}`;
    }
  });

  test("an inbound reply beyond page 100 survives the next unchanged-data count read", async () => {
    const sid = randomUUID();
    try {
      expect(await helpers.readWorkspaceUnreadConversationCount(workspaceId)).toBe(107);
      // Its old creation time deliberately keeps this conversation beyond 100.
      await client`INSERT INTO public.message (sid, workspace, "from", "to", direction, status, date_created)
        VALUES (${sid}, ${workspaceId}::uuid, ${phone(104)}, ${workspaceNumber},
                'inbound', 'received', '2026-10-04T11:00:00Z')`;
      expect(await helpers.readWorkspaceUnreadConversationCount(workspaceId)).toBe(108);
      expect(await helpers.readWorkspaceUnreadConversationCount(workspaceId)).toBe(108);
    } finally {
      await client`DELETE FROM public.message WHERE workspace = ${workspaceId}::uuid AND sid = ${sid}`;
    }
  });
});
