import { randomUUID } from "node:crypto";
import postgres from "postgres";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse.js";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const foreignId = randomUUID();
const missingId = randomUUID();
const foreignFlags = { liveTranscription: false, liveCoaching: true, batchTranscription: false };

const cases = [
  { name: "true flags survive malformed known sibling", flags: { liveTranscription: true, liveCoaching: "private-known-value", batchTranscription: true, operatorNote: "private-unknown-value" }, enabled: true, keys: ["liveCoaching"] },
  { name: "malformed requested flags stay off", flags: { liveTranscription: "private-transcription-value", liveCoaching: false, batchTranscription: "private-batch-value" }, enabled: false, keys: ["liveTranscription", "batchTranscription"] },
  { name: "missing flags stay off", flags: {}, enabled: false, keys: [] },
  { name: "false flags stay off without warnings", flags: { liveTranscription: false, liveCoaching: false, batchTranscription: false }, enabled: false, keys: [] },
  { name: "true flags remain enabled without warnings", flags: { liveTranscription: true, liveCoaching: true, batchTranscription: true }, enabled: true, keys: [] },
  { name: "unknown keys are not diagnosed", flags: { operatorNote: "private-unknown-value" }, enabled: false, keys: [] },
  { name: "invalid known siblings are diagnosed when requested flags are off", flags: { liveTranscription: false, liveCoaching: "private-known-value", batchTranscription: false }, enabled: false, keys: ["liveCoaching"] },
];

suite("real stored workspace feature flags (#2118)", () => {
  let client: postgres.Sql;
  let projection: typeof import("@/lib/workspace-client-projection.server");
  let members: typeof import("@/lib/workspace-members-db.server");
  let worker: typeof import("@/lib/worker/handlers/elevenlabs-batch-transcribe.server");
  let capabilities: typeof import("@/lib/live-media-capabilities");
  let stream: typeof import("@/lib/media-stream-twiml.server");
  let logger: typeof import("@/lib/logger.server").logger;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Feature flag tests need a database URL");
    process.env.DATABASE_URL = databaseUrl;
    vi.stubEnv("MEDIA_STREAM_SECRET", "feature-flag-fixture-secret");
    vi.stubEnv("MEDIA_STREAM_HOST", "fixture.invalid");
    client = postgres(databaseUrl, { max: 1 });
    for (const id of [workspaceId, foreignId]) {
      const flags = id === foreignId ? foreignFlags : {};
      await client`insert into public.workspace (id, name, twilio_data, disabled, feature_flags, credits, key, token)
        values (${id}::uuid, 'Feature flag fixture', '{}'::jsonb, false, ${client.json(flags)},
          1000, ${`private-key-marker-${id}`}, ${`private-token-marker-${id}`})`;
    }
    projection = await import("@/lib/workspace-client-projection.server");
    members = await import("@/lib/workspace-members-db.server");
    worker = await import("@/lib/worker/handlers/elevenlabs-batch-transcribe.server");
    capabilities = await import("@/lib/live-media-capabilities");
    stream = await import("@/lib/media-stream-twiml.server");
    ({ logger } = await import("@/lib/logger.server"));
  });

  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterAll(async () => {
    try {
      if (client) await client`delete from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await client?.end();
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
    }
  });

  const readers = [
    {
      name: "client projection",
      read: async (id: string) => {
        const row = await projection.getWorkspaceForClient(id);
        if (!row) return { enabled: false };
        expect(row).not.toHaveProperty("key");
        expect(row).not.toHaveProperty("token");
        expect(row).not.toHaveProperty("twilio_data");
        return { enabled: capabilities.liveMediaCapabilities(row.feature_flags as Record<string, unknown>).attachStream };
      },
    },
    {
      name: "server workspace and TwiML",
      read: async (id: string) => {
        const row = await members.getWorkspaceById(id);
        if (!row) return { enabled: false };
        const voice = new VoiceResponse();
        const enabled = stream.appendLiveTranscriptionStreamTwiml({
          twiml: voice,
          featureFlags: row.feature_flags as Record<string, unknown>,
          params: { workspaceId: id, userId: "fixture-user", direction: "outbound" },
        });
        return { enabled, xml: voice.toString() };
      },
    },
    { name: "batch worker flag", read: async (id: string) => {
      return { enabled: await worker.isBatchTranscriptionEnabled(id) };
    } },
  ];

  describe.each(readers)("$name", ({ read }) => {
    test.each(cases)("$name", async ({ flags, enabled, keys }) => {
      await client`update public.workspace set feature_flags = ${client.json(flags)} where id = ${workspaceId}::uuid`;
      const result = await read(workspaceId);
      expect(result.enabled).toBe(enabled);
      if ("xml" in result) {
        if (enabled) expect(result.xml).toContain("<Stream");
        else expect(result.xml).not.toContain("<Stream");
      }
      if (keys.length) {
        expect(logger.warn).toHaveBeenCalledExactlyOnceWith("workspace.feature_flags.invalid", { workspaceId, keys });
      } else {
        expect(logger.warn).not.toHaveBeenCalled();
      }
      const rows = await client<{ id: string; feature_flags: unknown }[]>`
        select id, feature_flags from public.workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
      expect(rows.find((row) => row.id === workspaceId)?.feature_flags).toEqual(flags);
      expect(rows.find((row) => row.id === foreignId)?.feature_flags).toEqual(foreignFlags);
    });

    test("a missing workspace stays off without warnings", async () => {
      expect((await read(missingId)).enabled).toBe(false);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
