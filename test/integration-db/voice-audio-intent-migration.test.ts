import { useOwnedAudioFixture, sql } from "../helpers/voice-audio-fixture";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

describe("legacy audio request migration (#2879)", () => {
  useOwnedAudioFixture();
  test("backfills phone and live-computer requests without resetting a newer control owner", async () => {
    const schema = `audio_intent_migration_${randomUUID().replaceAll("-", "")}`;
    const workspace = randomUUID(), phoneId = randomUUID(), phoneIntent = randomUUID(), computerId = randomUUID(), computerIntent = randomUUID();
    const newerIntent = randomUUID(), root = `CA${"2".repeat(32)}`, source = `CA${"3".repeat(32)}`;
    const migration = readFileSync(new URL("../../client/migrations/20261030000008_voice_audio_request_controls.sql", import.meta.url), "utf8").replaceAll("public.", `"${schema}".`);
    await sql.unsafe(`create schema "${schema}"`);
    try {
      await sql.unsafe(`create table "${schema}".workspace (id uuid primary key);
        create table "${schema}".workspace_voice_audio_connection (id uuid primary key, workspace uuid not null, user_id text not null,
          intent_id uuid not null, transport text not null, destination text not null, requested_call_sid text, source_agent_sid text,
          campaign_id bigint, cancel_requested_at timestamptz, created_at timestamptz not null default now())`);
      await sql.unsafe(`insert into "${schema}".workspace(id) values ($1)`, [workspace]);
      await sql.unsafe(`insert into "${schema}".workspace_voice_audio_connection(id, workspace, user_id, intent_id, transport, destination,
        requested_call_sid, source_agent_sid, campaign_id) values ($1,$2,'agent-one',$3,'phone','+16135550123',null,$4,42),
        ($5,$2,'agent-two',$6,'computer','client:agent-two',$7,$4,91)`, [phoneId, workspace, phoneIntent, source, computerId, computerIntent, root]);
      await sql.unsafe(migration);
      const phone = await sql.unsafe(`select request, connection_id from "${schema}".workspace_voice_audio_intent where intent_id=$1`, [phoneIntent]);
      const computer = await sql.unsafe(`select request, connection_id from "${schema}".workspace_voice_audio_intent where intent_id=$1`, [computerIntent]);
      expect(phone[0]).toEqual({ connection_id: phoneId, request: { transport: "phone", destination: "+16135550123", callSid: null, expectedAgentSid: null, campaignId: 42 } });
      expect(computer[0]).toEqual({ connection_id: computerId, request: { transport: "computer", destination: null, callSid: root, expectedAgentSid: source, campaignId: null } });
      await sql.unsafe(`update "${schema}".workspace_voice_audio_connection set control_intent_id=$1 where id=$2`, [newerIntent, phoneId]);
      await sql.unsafe(`update "${schema}".workspace_voice_audio_intent set cancel_requested_at='2026-10-30T00:00:00Z' where intent_id=$1`, [phoneIntent]);
      await sql.unsafe(migration);
      const controls = await sql.unsafe(`select control_intent_id from "${schema}".workspace_voice_audio_connection where id=$1`, [phoneId]);
      const intents = await sql.unsafe(`select count(*)::int as total, count(cancel_requested_at)::int as canceled from "${schema}".workspace_voice_audio_intent`);
      expect(controls[0].control_intent_id).toBe(newerIntent); expect(intents[0]).toEqual({ total: 2, canceled: 1 });
    } finally { await sql.unsafe(`drop schema "${schema}" cascade`); }
  });
});
