import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildAgentBridgeTwiml,
  buildHoldMusicTwiml,
  makeQueueName,
  parseQueueIdFromName,
} from "../_shared/acd-utils.ts";
import {
  claimAgentForQueue as claimAgentForQueueRouter,
  loadWorkspaceTwilioCredentials as loadWorkspaceTwilioCredentialsRouter,
  lookupQueue as lookupQueueRouter,
  nextQueueOffer as nextQueueOfferRouter,
  releaseAgent as releaseAgentRouter,
} from "../_shared/acd-router.ts";
import { handleRequest } from "../acd-router/index.ts";

Deno.test("makeQueueName and parseQueueIdFromName round-trip", () => {
  const id = 42;
  const name = makeQueueName(id);
  assertEquals(name, "inbound_q_42");
  assertEquals(parseQueueIdFromName(name), 42);
  assertEquals(parseQueueIdFromName("inbound_q_abc"), null);
  assertEquals(parseQueueIdFromName("inbound_q_"), null);
  assertEquals(parseQueueIdFromName("other_q_42"), null);
});

Deno.test("buildHoldMusicTwiml returns default message when no hold audio", () => {
  const twiml = buildHoldMusicTwiml({ holdAudio: null, queueName: "inbound_q_1" });
  assertEquals(twiml.includes("You are now in the queue"), true);
  assertEquals(twiml.includes("<?xml"), true);
  assertEquals(twiml.includes("<Response>"), true);
  assertEquals(twiml.includes("</Response>"), true);
});

Deno.test("buildHoldMusicTwiml returns Play element when hold audio provided", () => {
  const twiml = buildHoldMusicTwiml({
    holdAudio: "https://example.com/hold.mp3",
    queueName: "inbound_q_1",
  });
  assertEquals(twiml.includes("<Play>"), true);
  assertEquals(twiml.includes("https://example.com/hold.mp3"), true);
  assertEquals(twiml.includes("<Say>"), false);
});

Deno.test("buildAgentBridgeTwiml returns Dequeue TwiML", () => {
  const twiml = buildAgentBridgeTwiml("inbound_q_42");
  assertEquals(twiml.includes("<Queue>inbound_q_42</Queue>"), true);
  assertEquals(twiml.includes("<Dial>"), true);
  assertEquals(twiml.includes("<?xml"), true);
});

Deno.test("buildAgentBridgeTwiml escapes XML special chars in queue name", () => {
  const twiml = buildAgentBridgeTwiml("inbound_q_1&2");
  assertEquals(twiml.includes("<Queue>inbound_q_1&amp;2</Queue>"), true);
});

function createFakeSupabase(args: {
  tableData?: Record<string, unknown> | null;
  rpcData?: unknown[] | null;
  rpcError?: unknown;
}) {
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: args.tableData ?? null });
                },
              };
            },
          };
        },
      };
    },
    rpc(name: string, params: Record<string, unknown>) {
      rpcCalls.push({ name, params });
      return Promise.resolve({ data: args.rpcData ?? null, error: args.rpcError ?? null });
    },
  };
  return { client, rpcCalls };
}

Deno.test("acd-router shared helpers read queue and credentials", async () => {
  const queue = {
    id: 7,
    workspace_id: "workspace-1",
    name: "Support",
    hold_audio: "https://example.com/hold.mp3",
  };
  const queueSupabase = createFakeSupabase({ tableData: queue });
  assertEquals(await lookupQueueRouter(queueSupabase.client as never, 7), queue);

  const credentialsSupabase = createFakeSupabase({
    tableData: { twilio_data: { account_sid: "AC123", auth_token: "secret" } },
  });
  assertEquals(
    await loadWorkspaceTwilioCredentialsRouter(credentialsSupabase.client as never, "workspace-1"),
    { accountSid: "AC123", authToken: "secret" },
  );

  const missingCredentialsSupabase = createFakeSupabase({ tableData: { twilio_data: null } });
  assertEquals(
    await loadWorkspaceTwilioCredentialsRouter(missingCredentialsSupabase.client as never, "workspace-1"),
    null,
  );
});

Deno.test("acd-router shared helpers wrap queue RPCs", async () => {
  const claimSupabase = createFakeSupabase({
    rpcData: [{ agent_user_id: "agent-1", entry_id: 99 }],
  });
  assertEquals(
    await claimAgentForQueueRouter({
      supabase: claimSupabase.client as never,
      queueId: 7,
      workspaceId: "workspace-1",
      callSid: "CA123",
      callerNumber: "+15551234567",
    }),
    { agentUserId: "agent-1", entryId: 99 },
  );
  assertEquals(claimSupabase.rpcCalls[0]?.name, "claim_inbound_queue_entry");

  const noClaimSupabase = createFakeSupabase({ rpcData: [] });
  assertEquals(
    await claimAgentForQueueRouter({
      supabase: noClaimSupabase.client as never,
      queueId: 7,
      workspaceId: "workspace-1",
      callSid: "CA123",
      callerNumber: "+15551234567",
    }),
    null,
  );

  const nextSupabase = createFakeSupabase({ rpcData: [{ call_sid: "CA456", entry_id: 100 }] });
  assertEquals(
    await nextQueueOfferRouter({
      supabase: nextSupabase.client as never,
      queueId: 7,
      agentUserId: "agent-1",
      workspaceId: "workspace-1",
    }),
    { callSid: "CA456", entryId: 100 },
  );
  assertEquals(nextSupabase.rpcCalls[0]?.name, "next_inbound_queue_offer");

  const releaseSupabase = createFakeSupabase({});
  await releaseAgentRouter(releaseSupabase.client as never, 99, "declined");
  assertEquals(releaseSupabase.rpcCalls[0], {
    name: "release_inbound_offer",
    params: { p_entry_id: 99, p_outcome: "declined" },
  });
});

Deno.test("acd-router edge handleRequest returns TwiML and JSON for simple paths", async () => {
  Deno.env.set("SUPABASE_URL", "http://localhost");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");

  const waitResponse = await handleRequest(
    new Request("http://localhost/functions/v1/acd-router?queue_id=0"),
  );
  assertEquals(await waitResponse.text(), buildHoldMusicTwiml({ holdAudio: null, queueName: "" }));

  const statusResponse = await handleRequest(
    new Request("http://localhost/functions/v1/acd-router/agent-status"),
  );
  assertEquals(await statusResponse.json(), { ok: true });
});

function createAcdMockSupabase(args: {
  queue?: { id: number; workspace_id: string; name: string; hold_audio: string | null } | null;
  workspaceTwilioData?: Record<string, unknown> | null;
  entryWorkspaceId?: string | null;
}) {
  return {
    from(table: string) {
      if (table === "inbound_queue") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: args.queue ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === "workspace") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: args.workspaceTwilioData === undefined
                    ? null
                    : { twilio_data: args.workspaceTwilioData },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "inbound_queue_entry") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: args.entryWorkspaceId
                    ? { workspace_id: args.entryWorkspaceId }
                    : null,
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

Deno.test("acd-router edge accepts agent-bridge with valid Twilio signature", async () => {
  Deno.env.set("SUPABASE_URL", "http://localhost");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  const authToken = "test-token";
  const workspaceId = "workspace-1";
  const validationUrl = "http://localhost/functions/v1/acd-router/agent-bridge?queue_name=inbound_q_7";

  const { getExpectedTwilioSignature } = await import(
    "npm:twilio@^5.3.0/lib/webhooks/webhooks.js"
  );
  const signature = getExpectedTwilioSignature(authToken, validationUrl, {});

  const mockSupabase = createAcdMockSupabase({
    queue: { id: 7, workspace_id: workspaceId, name: "Support", hold_audio: null },
    workspaceTwilioData: { account_sid: "AC123", auth_token: authToken },
  });

  const response = await handleRequest(
    new Request("http://localhost/functions/v1/acd-router/agent-bridge?queue_name=inbound_q_7", {
      method: "POST",
      headers: { "x-twilio-signature": signature },
    }),
    { supabase: mockSupabase as never },
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Content-Type"), "text/xml");
  assertEquals(await response.text(), buildAgentBridgeTwiml("inbound_q_7"));
});

Deno.test("acd-router edge rejects agent-bridge with invalid Twilio signature", async () => {
  Deno.env.set("SUPABASE_URL", "http://localhost");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");

  const mockSupabase = createAcdMockSupabase({
    queue: { id: 7, workspace_id: "workspace-1", name: "Support", hold_audio: null },
    workspaceTwilioData: { account_sid: "AC123", auth_token: "test-token" },
  });

  const response = await handleRequest(
    new Request("http://localhost/functions/v1/acd-router/agent-bridge?queue_name=inbound_q_7", {
      method: "POST",
      headers: { "x-twilio-signature": "invalid-signature" },
    }),
    { supabase: mockSupabase as never },
  );

  assertEquals(response.status, 403);
  assertEquals(await response.text(), "Invalid Twilio signature");
});

Deno.test("acd-router edge rejects wait URL with invalid Twilio signature", async () => {
  Deno.env.set("SUPABASE_URL", "http://localhost");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");

  const mockSupabase = createAcdMockSupabase({
    queue: { id: 7, workspace_id: "workspace-1", name: "Support", hold_audio: null },
    workspaceTwilioData: { account_sid: "AC123", auth_token: "test-token" },
  });

  const form = new FormData();
  form.set("CallSid", "CA123");
  form.set("From", "+15551234567");
  form.set("QueueTime", "3");

  const response = await handleRequest(
    new Request("http://localhost/functions/v1/acd-router?queue_id=7", {
      method: "POST",
      headers: { "x-twilio-signature": "invalid-signature" },
      body: form,
    }),
    { supabase: mockSupabase as never },
  );

  assertEquals(response.status, 403);
  assertEquals(await response.text(), "Invalid Twilio signature");
});
