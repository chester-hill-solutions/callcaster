import { useOwnedAudioFixture, actor, baseUrl, bridgeParams, endedReplacementFixture, journal, markPromotionReady, otherActor, otherPhone, parentContinuationFixture, rooms, sid, signedAudio, signedParent, sql, state, type ApiPhysical, web, workspaceId } from "../helpers/voice-audio-fixture";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

describe("owned agent audio connection journal (#2879)", () => {
  useOwnedAudioFixture();

  test.each(["DELETE", "PUT", "PATCH"])("parent continuation rejects signed %s without processing the call", async (method) => {
    const f = await parentContinuationFixture(), before = await state();
    const response = await signedParent(f.url, f.params, true, [], { method });
    expect(response.status).toBe(405); expect(response.headers.get("Allow")).toBe("POST");
    expect(web.fetch).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test("a replacement account token cannot resume an old manual parent", async () => {
    const f = await parentContinuationFixture();
    expect((await signedParent(f.url, f.params)).status).toBe(200);
    await sql`update public.workspace set twilio_data = ${sql.json({ sid: `AC${"7".repeat(32)}`, authToken: "replacement-token" })}
      where id = ${workspaceId}::uuid`;
    const { invalidateWorkspaceTwilioData } = await import("@/lib/merge-workspace-twilio-data.server");
    invalidateWorkspaceTwilioData(workspaceId);
    expect((await signedParent(f.url, f.params, true, [], { signingToken: "replacement-token" })).status).toBe(403);
    expect(web.update).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
  });
  test.each([false, true])("signed parent continuation preserves the existing customer and original audio, REST=%s", async (rest) => {
    const f = await parentContinuationFixture(rest), before = await state();
    const identity = () => sql`select r.provider_sid, r.setup_sid, r.account_sid, r.conference_id, c.sid, c.direction, c.parent_call_sid
      from public.workspace_voice_reservation r join public.call c on c.sid = r.provider_sid where r.id = ${f.target.id}::uuid`;
    const prior = await identity();
    for (let retry = 0; retry < 3; retry++) {
      const response = await signedParent(f.url, f.params); expect(response.status).toBe(200); const xml = await response.text();
      expect(xml).toContain(`>${f.row.conference_id}</Conference>`); expect(xml).toContain('endConferenceOnExit="false"');
      expect(xml).toContain('muted="false"'); expect(xml).toContain(`participantLabel="parent:${f.row.id}:${f.row.generation}"`);
      const callback = xml.match(/<Conference[^>]*statusCallback="([^"]+)"/);
      if (!callback) throw new Error("Original parent conference callback required");
      const url = new URL(callback[1].replaceAll("&amp;", "&"));
      expect(url.hash).toBe("#ct=1000&rt=3000&tt=15000&rc=2&rp=ct,rt,5xx");
      url.hash = ""; expect(url.href).toBe(f.row.conference_callback);
      expect(xml).not.toContain("<Number");
    }
    expect(await state()).toEqual(before); expect(await identity()).toEqual(prior);
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ state: "switching", committed_at: null });
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled(); expect(rooms.update).not.toHaveBeenCalled();
  });
  test.each(["ordinary", "unjoined", "committed", "wrong-customer", "wrong-actor", "settled-customer", "ended-parent"])("parent continuation cannot adopt %s audio", async (change) => {
    const f = await parentContinuationFixture();
    if (change === "ordinary") await sql`update public.workspace_voice_audio_connection set promotion_requested_at = null, state = 'ready' where id = ${f.row.id}::uuid`;
    if (change === "unjoined") await sql`update public.workspace_voice_audio_connection set joined_at = null where id = ${f.row.id}::uuid`;
    if (change === "committed") await sql`update public.workspace_voice_audio_connection set state = 'active', committed_at = now() where id = ${f.row.id}::uuid`;
    if (change === "wrong-customer") await sql`update public.workspace_voice_audio_connection set customer_sid = ${sid()} where id = ${f.row.id}::uuid`;
    if (change === "wrong-actor") await sql`update public.workspace_voice_audio_connection set user_id = ${otherActor} where id = ${f.row.id}::uuid`;
    if (change === "settled-customer") await sql`update public.workspace_voice_reservation set state = 'settled' where id = ${f.target.id}::uuid`;
    if (change === "ended-parent") await sql`update public.workspace_voice_reservation set setup_terminal_at = now(), setup_terminal_status = 'completed' where id = ${f.target.id}::uuid`;
    const before = await state(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(200); expect(await response.text()).toContain("<Hangup");
    expect(web.fetch).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test.each(["failed", "canceled", "retired"])("a %s replacement still lets the original parent rejoin its customer", async (failureState) => {
    const f = await parentContinuationFixture();
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    if (failureState === "canceled") await sql`update public.workspace_voice_audio_connection set cancel_requested_at = now() where id = ${f.row.id}::uuid`;
    await observeVoiceAudioStatus(f.row, "completed", "10");
    if (failureState === "retired") await sql`update public.workspace_voice_audio_connection set state = 'retired', retired_at = now() where id = ${f.row.id}::uuid`;
    const before = await state(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(200); expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
    expect(await state()).toEqual(before);
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ state: failureState, committed_at: null });
    expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
  });
  test("a failed old promotion cannot restore the original parent after a newer transport commits", async () => {
    const f = await parentContinuationFixture(), nextId = randomUUID();
    const { observeVoiceAudioStatus } = await import("@/server/voice-audio-lifecycle.server");
    await observeVoiceAudioStatus(f.row, "completed", "10");
    await markPromotionReady(f.row);
    const now = new Date().toISOString(), nextRoom = `${actor}~${randomUUID()}`;
    const overrides = { id: nextId, intent_id: randomUUID(), generation: f.row.generation + 1, destination: otherPhone,
      state: "active", provider_sid: sid(), conference_id: nextRoom, conference_sid: `CF${randomUUID().replaceAll("-", "")}`,
      voice_url: `${baseUrl}/api/voice-audio?connection=${nextId}&event=voice`, status_callback: `${baseUrl}/api/voice-audio?connection=${nextId}&event=status`,
      conference_callback: `${baseUrl}/api/voice-audio?connection=${nextId}&event=conference`, committed_at: now, joined_at: now,
      customer_joined_at: now, parent_joined_at: now, terminal_at: null, terminal_status: null, retired_at: null, cancel_requested_at: null };
    Object.assign(overrides, { promotion_requested_at: null, promotion_result: null });
    await sql`insert into public.workspace_voice_audio_connection
      select (jsonb_populate_record(null::public.workspace_voice_audio_connection, to_jsonb(prior) || ${sql.json(overrides)}::jsonb)).*
      from public.workspace_voice_audio_connection prior where prior.id = ${f.row.id}::uuid`;
    const response = await signedParent(f.url, f.params); expect(response.status).toBe(200);
    expect(await response.text()).toContain("<Hangup"); expect(web.fetch).not.toHaveBeenCalled();
  });
  test.each(["AccountSid", "CallSid", "DialCallSid", "From", "To", "Direction", "ParentCallSid", "call_sid", "dial_call_sid"])("signed parent rejects conflicting %s", async (key) => {
    const f = await parentContinuationFixture(true), params = { ...f.params, [key]: key.endsWith("Sid") || key === "call_sid" ? sid() : "wrong" };
    const before = await state(), response = await signedParent(f.url, params);
    expect(response.status).toBe(403); expect(web.fetch).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test.each([["CallSid", "call_sid"], ["DialCallSid", "dial_call_sid"]])("parent normalizes signed %s only after raw signature validation", async (canonical, alias) => {
    const f = await parentContinuationFixture(), params: Record<string, string> = { ...f.params };
    params[alias] = params[canonical] ?? ""; delete params[canonical];
    const response = await signedParent(f.url, params); expect(response.status).toBe(200);
    expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
  });
  test.each(["signature", "duplicate-form", "duplicate-query", "extra-query", "foreign-nonce", "unsaved-url"])("parent rejects %s before any provider read", async (change) => {
    const f = await parentContinuationFixture(); let url = f.url;
    if (change === "duplicate-query") url += `&credit_reservation=${f.target.id}`;
    if (change === "extra-query") url += "&other=1";
    if (change === "foreign-nonce") url = `${baseUrl}/api/voice-continuation?credit_reservation=${randomUUID()}`;
    if (change === "unsaved-url") await sql`update public.workspace_voice_reservation set setup_continuation_url = null where id = ${f.target.id}::uuid`;
    const before = await state(), response = await signedParent(url, f.params, change !== "signature", change === "duplicate-form" ? [["CallSid", f.target.parent]] : []);
    expect(response.status).toBe(403); expect(web.fetch).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test.each([
    ["parent", "sid"], ["parent", "accountSid"], ["parent", "to"], ["parent", "from"], ["parent", "direction"], ["parent", "parentCallSid"],
    ["child", "sid"], ["child", "accountSid"], ["child", "to"], ["child", "from"], ["child", "direction"], ["child", "parentCallSid"],
  ])("parent continuation checks actual %s %s", async (leg, field) => {
    const f = await parentContinuationFixture(), id = leg === "parent" ? f.target.parent : f.target.child;
    const physical = web.records.get(id); if (!physical) throw new Error("Owned physical call required");
    web.records.set(id, { ...physical, [field]: field === "sid" || field === "parentCallSid" ? sid() : "wrong" });
    const before = await state(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(403); expect(await state()).toEqual(before); expect(web.update).not.toHaveBeenCalled();
  });
  test.each(["parent", "child"])("an ended %s cannot resume a manual promotion", async (leg) => {
    const f = await parentContinuationFixture(), id = leg === "parent" ? f.target.parent : f.target.child;
    const physical = web.records.get(id); if (!physical) throw new Error("Owned physical call required"); physical.status = "completed";
    const before = await state(), response = await signedParent(f.url, f.params);
    expect(response.status).toBe(200); expect(await response.text()).toContain("<Hangup"); expect(await state()).toEqual(before);
  });
  test("a temporary provider read failure preserves the original parent without committing replacement audio", async () => {
    const f = await parentContinuationFixture(), before = await state();
    web.fetch.mockRejectedValueOnce(new Error("Owned parent read failure"));
    const first = await signedParent(f.url, f.params); expect(first.status).toBe(200);
    expect(await first.text()).toContain(`>${f.row.conference_id}</Conference>`);
    const response = await signedParent(f.url, f.params); expect(response.status).toBe(200);
    expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
    expect(await state()).toEqual(before); expect(web.create).not.toHaveBeenCalled(); expect(web.update).not.toHaveBeenCalled();
    expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ state: "switching", committed_at: null });
  });
  test("unavailable original API credentials cannot send provider reads to another account or drop the parent", async () => {
    const f = await parentContinuationFixture(), before = await state(); web.accountSid = `AC${randomUUID().replaceAll("-", "")}`;
    const response = await signedParent(f.url, f.params); expect(response.status).toBe(200);
    expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
    expect(web.fetch).not.toHaveBeenCalled(); expect(web.create).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
  test("a slow provider read cannot keep the parent continuation waiting beyond its voice response budget", async () => {
    const f = await parentContinuationFixture(), releases: Array<() => void> = [];
    web.fetch.mockImplementation((id: string) => new Promise<ApiPhysical>((resolve) => {
      const physical = web.records.get(id); if (!physical) throw new Error("Owned physical call required");
      releases.push(() => resolve(physical));
    }));
    const pending = signedParent(f.url, f.params); let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([pending, new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("Original audio was not preserved within 3 seconds")), 3000);
      })]);
      expect(response.status).toBe(200); expect(await response.text()).toContain(`>${f.row.conference_id}</Conference>`);
      expect(await journal.findVoiceAudioConnection(f.row.id)).toMatchObject({ state: "switching", committed_at: null });
    } finally {
      clearTimeout(deadline); for (const release of releases) release(); await pending;
    }
  });
  test.each(["parent", "customer"] as const)("an ended replacement still records its owned %s conference join", async (leg) => {
    const f = await endedReplacementFixture(), before = await state();
    const response = await signedAudio(f.row.conference_callback, bridgeParams(f, leg, true)); expect(response.status).toBe(204);
    const saved = await journal.findVoiceAudioConnection(f.row.id);
    expect(leg === "parent" ? saved?.parent_joined_at : saved?.customer_joined_at).toBeInstanceOf(Date);
    expect(saved).toMatchObject({ state: "failed", committed_at: null, terminal_status: "completed" });
    expect(await state()).toEqual(before); expect(rooms.update).not.toHaveBeenCalled();
  });
  test.each([
    { leg: "parent" as const, statusFirst: false }, { leg: "parent" as const, statusFirst: true }, { leg: "customer" as const, statusFirst: false },
  ])("a genuine current $leg hangup ends its owned manual room, statusFirst=$statusFirst", async ({ leg, statusFirst }) => {
    const f = await endedReplacementFixture();
    if (statusFirst) {
      await sql`update public.call set status = 'completed' where sid = ${f.target.parent}`;
      await sql`update public.workspace_voice_reservation set setup_terminal_at = now(), setup_terminal_status = 'completed' where id = ${f.target.id}::uuid`;
    }
    const before = await state(), response = await signedAudio(f.row.conference_callback, bridgeParams(f, leg, false));
    expect(response.status).toBe(204); expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed");
    expect(await state()).toEqual(before);
    const [child] = await sql`select status from public.call where sid = ${f.target.child}`;
    expect(child.status).toBe("in-progress"); expect(web.update).not.toHaveBeenCalled();
  });
  test("a retired original parent cannot end the customer room through the first callback owner", async () => {
    const f = await endedReplacementFixture(true);
    const response = await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false)); expect(response.status).toBe(204);
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("in-progress"); expect(rooms.fetch).not.toHaveBeenCalled();
    expect((await journal.findVoiceAudioConnection(f.row.id))?.conference_stop_requested_at).toBeNull();
  });
  test("a manual-room stop failure retries its exact room without customer outcomes", async () => {
    const f = await endedReplacementFixture(), before = await state(), params = bridgeParams(f, "parent", false);
    rooms.update.mockRejectedValueOnce(new Error("Owned manual room stop failure"));
    expect((await signedAudio(f.row.conference_callback, params)).status).toBe(500);
    expect((await signedAudio(f.row.conference_callback, params)).status).toBe(204);
    expect(rooms.records.get(f.conferenceSid)?.status).toBe("completed"); expect(await state()).toEqual(before);
  });
  test.each(["sid", "accountSid", "friendlyName"])("manual room stop refuses a provider %s mismatch", async (field) => {
    const f = await endedReplacementFixture(), physical = rooms.records.get(f.conferenceSid);
    if (!physical) throw new Error("Owned provider conference required");
    rooms.records.set(f.conferenceSid, { ...physical, [field]: "foreign" });
    const before = await state(), response = await signedAudio(f.row.conference_callback, bridgeParams(f, "parent", false));
    expect(response.status).toBe(500); expect(rooms.update).not.toHaveBeenCalled(); expect(await state()).toEqual(before);
  });
});
