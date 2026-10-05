import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const session = vi.hoisted(() => ({ userId: "" as string | null }));
const storage = vi.hoisted(() => ({ upload: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: vi.fn(async () => ({
    user: session.userId ? { id: session.userId } : null,
    headers: new Headers(),
  })),
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  uploadObject: storage.upload,
  createSignedObjectUrl: storage.sign,
}));
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/campaign-ivr.server")>();
  return {
    ...original,
    findCampaignInWorkspace: vi.fn(original.findCampaignInWorkspace),
    updateCampaignVoicedropAudio: vi.fn(original.updateCampaignVoicedropAudio),
  };
});

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = randomUUID();
const foreignWorkspace = randomUUID();
const actor = randomUUID();
const outsider = randomUUID();
const signedUrl = "https://fixture.invalid/audio/owned.mp3";

suite("audio upload validates real campaign targets before storage (#2355)", () => {
  let client: postgres.Sql;
  let ownedId: number;
  let foreignId: number;
  let missingId: number;
  let services: typeof import("@/lib/campaign-ivr.server");
  let action: typeof import("@/routes/api+/media.action.server").action;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Media target tests need a database URL");
    process.env.DATABASE_URL = databaseUrl;
    client = postgres(databaseUrl, { max: 1 });
    for (const id of [actor, outsider]) {
      await client`insert into public."user" (id, username, created_at)
        values (${id}::uuid, ${`media-target-${id}@example.test`}, now())`;
    }
    for (const id of [workspace, foreignWorkspace]) {
      await client`insert into public.workspace (id, name, twilio_data, disabled, feature_flags, credits)
        values (${id}::uuid, 'Media target fixture', '{}'::jsonb, false, '{}'::jsonb, 1000)`;
    }
    await client`insert into public.workspace_member (id, workspace_id, user_id, role_id)
      values (${`media-target:${workspace}:${actor}`}, ${workspace}, ${actor}, 'member')`;
    const rows = await client<{ id: string; workspace: string }[]>`
      insert into public.campaign (workspace, title, type, voicedrop_audio)
      values (${workspace}::uuid, 'Owned audio target', 'robocall', 'owned-before'),
        (${foreignWorkspace}::uuid, 'Foreign audio control', 'robocall', 'foreign-before')
      returning id, workspace`;
    ownedId = Number(rows.find((row) => row.workspace === workspace)?.id);
    foreignId = Number(rows.find((row) => row.workspace === foreignWorkspace)?.id);
    const [missing] = await client<{ id: string }[]>`
      insert into public.campaign (workspace, title, type)
      values (${workspace}::uuid, 'Missing target identity', 'robocall') returning id`;
    missingId = Number(missing.id);
    await client`delete from public.campaign where id = ${missingId}`;
    services = await import("@/lib/campaign-ivr.server");
    ({ action } = await import("@/routes/api+/media.action.server"));
  });

  afterAll(async () => {
    try {
      if (client) {
        await client`delete from public.campaign where workspace in (${workspace}::uuid, ${foreignWorkspace}::uuid)`;
        await client`delete from public.workspace_member where workspace_id = ${workspace}`;
        await client`delete from public.workspace where id in (${workspace}::uuid, ${foreignWorkspace}::uuid)`;
        await client`delete from public."user" where id in (${actor}::uuid, ${outsider}::uuid)`;
      }
    } finally {
      await client?.end();
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    session.userId = actor;
    storage.upload.mockResolvedValue(undefined);
    storage.sign.mockResolvedValue(signedUrl);
    await client`update public.campaign set voicedrop_audio = 'owned-before' where id = ${ownedId}`;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function send(value: string | File | null, requestedWorkspace = workspace) {
    const form = new FormData();
    form.set("file", new File(["fixture-audio"], "clip.mp3", { type: "audio/mpeg" }));
    form.set("workspace_id", requestedWorkspace);
    if (value !== null) form.set("live_campaign_id", value);
    const wire = new Request("http://localhost/api/media", { method: "POST", body: form });
    const request = new Request(wire.url, { method: "POST", headers: wire.headers, body: await wire.arrayBuffer() });
    const allocation = vi.spyOn(File.prototype, "arrayBuffer");
    const response = await asRouteResponse(action({ request, url: new URL(request.url), params: {}, context: new RouterContextProvider() }));
    return { response, allocation };
  }

  async function audioState() {
    return client<{ id: string; voicedrop_audio: string }[]>`
      select id, voicedrop_audio from public.campaign where id in (${ownedId}, ${foreignId}) order by id`;
  }

  function noMediaWork(allocation: ReturnType<typeof vi.spyOn>) {
    expect(allocation).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.sign).not.toHaveBeenCalled();
    expect(services.updateCampaignVoicedropAudio).not.toHaveBeenCalled();
  }

  test.each([
    { name: "missing", value: null },
    { name: "empty", value: "" },
    { name: "whitespace", value: " " },
    { name: "text", value: "bad" },
    { name: "NaN", value: "NaN" },
    { name: "infinity", value: "Infinity" },
    { name: "negative infinity", value: "-Infinity" },
    { name: "fraction", value: "1.5" },
    { name: "zero", value: "0" },
    { name: "negative", value: "-1" },
    { name: "unsafe integer", value: "9007199254740992" },
    { name: "integer overflow", value: "99999999999999999999999999999999999" },
    { name: "exponent", value: "1e2" },
    { name: "hexadecimal", value: "0x10" },
    { name: "trailing text", value: "1bad" },
  ])("$name campaign identifier returns 400 before lookup or media work", async ({ value }) => {
    const before = await audioState();
    const { response, allocation } = await send(value);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "A valid campaign ID is required" });
    expect(services.findCampaignInWorkspace).not.toHaveBeenCalled();
    noMediaWork(allocation);
    expect(await audioState()).toEqual(before);
  });

  test("a File campaign identifier is rejected before media work", async () => {
    const { response, allocation } = await send(new File(["1"], "id.txt"));
    expect(response.status).toBe(400);
    expect(services.findCampaignInWorkspace).not.toHaveBeenCalled();
    noMediaWork(allocation);
  });

  for (const target of ["missing", "foreign"] as const) {
    test(`${target} campaign returns the uniform 404 before media work`, async () => {
      const before = await audioState();
      const { response, allocation } = await send(String(target === "missing" ? missingId : foreignId));
      noMediaWork(allocation);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: "Campaign not found" });
      expect(services.findCampaignInWorkspace).toHaveBeenCalledOnce();
      expect(await audioState()).toEqual(before);
    });
  }

  test("a valid member uploads once and updates only the owned campaign", async () => {
    const { response, allocation } = await send(String(ownedId));
    expect(response.status).toBe(201);
    expect(await response.json()).toBe(signedUrl);
    expect(allocation).toHaveBeenCalledOnce();
    expect(storage.upload).toHaveBeenCalledOnce();
    expect(storage.upload.mock.calls[0]?.[2].toString()).toBe("fixture-audio");
    expect(storage.sign).toHaveBeenCalledOnce();
    expect(services.findCampaignInWorkspace).toHaveBeenCalledOnce();
    expect(services.updateCampaignVoicedropAudio).toHaveBeenCalledOnce();
    const rows = await audioState();
    expect(rows.find((row) => Number(row.id) === ownedId)?.voicedrop_audio).toBe(signedUrl);
    expect(rows.find((row) => Number(row.id) === foreignId)?.voicedrop_audio).toBe("foreign-before");
  });

  test("a non-member remains 404 before campaign lookup or media work", async () => {
    session.userId = outsider;
    const { response, allocation } = await send(String(ownedId));
    expect(response.status).toBe(404);
    expect(services.findCampaignInWorkspace).not.toHaveBeenCalled();
    noMediaWork(allocation);
  });

  test("a sessionless request remains 401 before campaign lookup or media work", async () => {
    session.userId = null;
    const { response, allocation } = await send(String(ownedId));
    expect(response.status).toBe(401);
    expect(services.findCampaignInWorkspace).not.toHaveBeenCalled();
    noMediaWork(allocation);
  });

  test("a scoped lookup failure stays 500 without media work", async () => {
    vi.mocked(services.findCampaignInWorkspace).mockRejectedValueOnce(new Error("private query detail"));
    const { response, allocation } = await send(String(ownedId));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private query detail");
    noMediaWork(allocation);
  });

  test("an empty final update cannot report successful attachment", async () => {
    const before = await audioState();
    vi.mocked(services.updateCampaignVoicedropAudio).mockResolvedValueOnce(null);
    const { response } = await send(String(ownedId));
    expect(response.status).toBe(500);
    expect(storage.upload).toHaveBeenCalledOnce();
    expect(storage.sign).toHaveBeenCalledOnce();
    expect(await audioState()).toEqual(before);
  });

  test("a real campaign removed during upload cannot report successful attachment", async () => {
    storage.upload.mockImplementationOnce(async () => {
      await client`delete from public.campaign where id = ${ownedId} and workspace = ${workspace}::uuid`;
    });
    try {
      const { response } = await send(String(ownedId));
      expect(response.status).toBe(500);
      expect(services.findCampaignInWorkspace).toHaveBeenCalledOnce();
      expect(services.updateCampaignVoicedropAudio).toHaveBeenCalledOnce();
      const rows = await audioState();
      expect(rows.some((row) => Number(row.id) === ownedId)).toBe(false);
      expect(rows.find((row) => Number(row.id) === foreignId)?.voicedrop_audio).toBe("foreign-before");
    } finally {
      await client`insert into public.campaign (id, workspace, title, type, voicedrop_audio)
        values (${ownedId}, ${workspace}::uuid, 'Owned audio target', 'robocall', 'owned-before')`;
    }
  });

  test("an attachment database error stays 500 and leaves both rows unchanged", async () => {
    const before = await audioState();
    vi.mocked(services.updateCampaignVoicedropAudio).mockRejectedValueOnce(new Error("private update detail"));
    const { response } = await send(String(ownedId));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private update detail");
    expect(await audioState()).toEqual(before);
  });
});
