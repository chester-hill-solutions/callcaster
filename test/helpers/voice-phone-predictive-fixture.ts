import { accountSid, actor, baseUrl, callerId, customer, otherActor, phone, signedAudio, sql, useOwnedAudioFixture, web, workspaceId } from "./voice-audio-fixture";
import { confirmed } from "./voice-audio-customer-fixture";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { beforeEach, expect, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { asRouteResponse, routeArgs } from "./route-result";
import { dataPlaneAuthContext } from "@/lib/route-context.server";
import { createTenantDb } from "@/server/tenant-db";
import { runAutoDialerTurn } from "@/lib/auto-dial.server";

const windowState = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/recipient-calling-window", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/recipient-calling-window")>(),
  recipientCallingWindowStatus: () => ({ allowed: windowState.allowed, timezone: "America/Toronto", reason: "owned_fixture_clock" }),
}));

export async function scenario(count = 3) {
  const f = await confirmed();
  const schedule = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day =>
    [day, { active: true, intervals: [{ start: "00:00", end: "12:00" }, { start: "12:00", end: "00:00" }] }]));
  const [campaign] = await sql`insert into public.campaign (workspace, title, type, status, caller_id, schedule, start_date, end_date)
    values (${workspaceId}::uuid, 'Owned phone predictive campaign', 'live_call', 'running', ${callerId},
      ${sql.json(schedule)}, '2000-01-01', '2100-01-01') returning id`;
  for (let index = 0; index < count; index++) {
    const [contact] = await sql`insert into public.contact (workspace, firstname, phone)
      values (${workspaceId}::uuid, 'Owned predictive customer', ${index === 0 ? customer : `+161355507${String(index).padStart(2, "0")}`}) returning id`;
    await sql`insert into public.campaign_queue (workspace, campaign_id, contact_id, queue_state, queue_order)
      values (${workspaceId}::uuid, ${campaign.id}, ${contact.id}, 'queued', ${index})`;
  }
  return { ...f, campaignId: Number(campaign.id), payload: { caller_id: callerId, selected_device: phone,
    dial_intent_id: randomUUID(), audio_connection_id: f.row.id, audio_generation: f.row.generation } };
}

export async function start(f: Awaited<ReturnType<typeof scenario>>, patch: Record<string, unknown> = {}, options: {
  apiKey?: boolean; scopes?: string[]; workspace?: string; userId?: string;
} = {}) {
  const targetWorkspace = options.workspace ?? workspaceId, context = new RouterContextProvider();
  context.set(dataPlaneAuthContext, { workspaceId: targetWorkspace, userId: options.apiKey ? null : options.userId ?? actor,
    ...(options.apiKey ? { apiKey: { keyId: 'owned-phone-start', scopes: options.scopes ?? ['calls.start'] } } : {}),
    tdb: createTenantDb(targetWorkspace) });
  const { action } = await import("../../app/routes/api+/workspaces+/$workspaceId/campaigns/$campaignId/dialer/start.action.server");
  return asRouteResponse(action({ ...routeArgs(new Request(`${baseUrl}/api/workspaces/${targetWorkspace}/campaigns/${f.campaignId}/dialer/start`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...f.payload, ...(options.apiKey ? { agentUserId: actor } : {}), ...patch }),
  }), { workspaceId: targetWorkspace, campaignId: String(f.campaignId) }), context }));
}

export async function voice(url: string, callSid: string, patch: Record<string, string> = {}, valid = true, token = "owned-audio-token") {
  const params = { AccountSid: accountSid, CallSid: callSid, To: web.records.get(callSid)?.to ?? customer,
    From: callerId, Direction: "outbound-api", CallStatus: "in-progress", AnsweredBy: "human", ...patch };
  const { action } = await import("../../app/routes/api+/auto-dial/$roomId.action.server");
  return asRouteResponse(action(routeArgs(new Request(url, { method: "POST", headers: {
    "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": valid ? twilio.getExpectedTwilioSignature(token, url, params) : "invalid",
  }, body: new URLSearchParams(params) }), { roomId: decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '') })));
}

export async function busyPair() {
  const f = await scenario(3); expect((await start(f)).status).toBe(200);
  expect(await runAutoDialerTurn({ user_id: actor, workspace_id: workspaceId, campaign_id: f.campaignId,
    conference_id: f.row.conference_id })).toMatchObject({ success: true });
  const roots = await sql`select id, provider_sid, voice_url, status_callback, queue_id from public.workspace_voice_reservation
    where workspace = ${workspaceId}::uuid and audio_mode = 'predictive' order by created_at, id`;
  expect(roots).toHaveLength(2);
  expect(await (await voice(roots[0].voice_url, roots[0].provider_sid)).text()).toContain('<Conference');
  expect(await (await voice(roots[1].voice_url, roots[1].provider_sid)).text()).toContain('<Hangup');
  return { f, roots, turn: () => runAutoDialerTurn({ user_id: actor, workspace_id: workspaceId,
    campaign_id: f.campaignId, conference_id: f.row.conference_id }) };
}

export async function participant(f: Awaited<ReturnType<typeof scenario>>, root: Record<string, string>, event: string, sequence: string) {
  if (!root.id || !root.provider_sid) throw new Error("A customer participant fixture requires its saved reservation ID and provider SID");
  return signedAudio(f.row.conference_callback, { AccountSid: accountSid, CallSid: root.provider_sid,
    ConferenceSid: f.row.conference_sid ?? '', FriendlyName: f.row.conference_id, ParticipantLabel: `customer:${root.id}`,
    StatusCallbackEvent: event, SequenceNumber: sequence, Timestamp: new Date().toISOString(), ReasonParticipantLeft: 'participant_hung_up' });
}

export async function finalStatus(root: Record<string, string>, seconds = '42') {
  const params = { AccountSid: accountSid, CallSid: root.provider_sid, To: web.records.get(root.provider_sid)?.to ?? customer,
    From: callerId, Direction: 'outbound-api', CallStatus: 'completed', CallDuration: seconds };
  const { action } = await import('../../app/routes/api+/auto-dial/status.action.server');
  return asRouteResponse(action(routeArgs(new Request(root.status_callback, { method: 'POST', headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Twilio-Signature': twilio.getExpectedTwilioSignature('owned-audio-token', root.status_callback, params),
  }, body: new URLSearchParams(params) }))));
}

export { windowState };

export function useOwnedPredictiveFixture() {
  useOwnedAudioFixture();
  beforeEach(async () => {
    windowState.allowed = true;
    await sql`delete from public.workspace_member where workspace_id = ${workspaceId} and user_id = ${otherActor}`;
    await sql`update public."user" set verified_audio_numbers = '{}' where id = ${otherActor}::uuid`;
    await sql`delete from public.predictive_machine_operation where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.outreach_attempt where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign_queue where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.contact where workspace = ${workspaceId}::uuid`;
    await sql`delete from public.campaign where workspace = ${workspaceId}::uuid`;
  });
}
