import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import crypto, { randomUUID } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { RouterContextProvider } from "react-router";
import { z } from "zod";
import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";
import { createSignedObjectUrl } from "@/lib/object-storage.server";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

const campaigns = vi.hoisted(() => new Map<number, { id: number; message_media: string[] }>());
const loggerMocks = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: async () => ({ session: null, user: null, headers: new Headers() }),
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: loggerMocks,
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: async () => undefined,
}));
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  findCampaignMessageMedia: async (_workspace: string, id: number) => campaigns.get(id),
  updateCampaignMessageMedia: async (_workspace: string, id: number, media: string[]) => {
    const campaign = { id, message_media: media };
    campaigns.set(id, campaign);
    return campaign;
  },
}));
vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return { ...actual, env: { ...actual.env,
    S3_ENDPOINT: () => "http://127.0.0.1:9000",
    S3_REGION: () => "us-east-1",
    S3_ACCESS_KEY_ID: () => "test-key",
    S3_SECRET_ACCESS_KEY: () => "test-secret",
    S3_BUCKET: () => "test-media",
    S3_BUCKET_MEDIA: () => undefined,
  } };
});

const objects = new Map<string, Buffer>();
const responseSchema = z.object({
  success: z.boolean(),
  url: z.string().optional(),
  uploadedFileName: z.string().optional(),
  error: z.unknown().optional(),
});

async function upload(bytes: string, campaignId?: number, filename = "photo.png") {
  const { action } = await import("../app/routes/api+/message_media.action.server");
  queueDualAuthSession({ user: { id: "u1" }, authType: "session", headers: new Headers() });
  const form = new FormData();
  form.set("workspaceId", "w1");
  form.set("image", new File([bytes], filename, { type: "image/png" }));
  if (campaignId !== undefined) form.set("campaignId", String(campaignId));
  const request = new Request("http://localhost/api/message_media", { method: "POST", body: form });
  const response = await asRouteResponse(action({
    request, url: new URL(request.url), params: {}, context: new RouterContextProvider(),
  }));
  return { status: response.status, ...responseSchema.parse(await response.json()) };
}

function bytesAt(url: string | undefined) {
  if (!url) throw new Error("Expected an uploaded media URL");
  const key = decodeURIComponent(new URL(url).pathname).replace(/^\/test-media\//, "");
  const bytes = objects.get(key);
  if (!bytes) throw new Error(`No stored object at ${key}`);
  return bytes.toString("utf-8");
}

beforeEach(() => {
  vi.mocked(randomUUID).mockImplementation(() => crypto.randomUUID());
  objects.clear();
  campaigns.clear();
  campaigns.set(1, { id: 1, message_media: [] });
  campaigns.set(2, { id: 2, message_media: [] });
  loggerMocks.error.mockReset();
  // A storage service that accepts unconditional writes, as the old caller did.
  vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command) => {
    if (command instanceof HeadObjectCommand) {
      if (objects.has(command.input.Key ?? "")) return { $metadata: {} };
      throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    }
    if (command instanceof PutObjectCommand) {
      const { Key, Body } = command.input;
      if (!Key || !Buffer.isBuffer(Body)) throw new Error("Unexpected storage payload");
      objects.set(Key, Buffer.from(Body));
      return { $metadata: {} };
    }
    throw new Error("Unexpected S3 operation");
  });
});
afterEach(() => vi.restoreAllMocks());

describe("MMS uploads with the real storage and signing adapter", () => {
  test("same-name chat uploads retain separate bytes and preserve an old URL", async () => {
    objects.set("messageMedia/w1/photo.png", Buffer.from("historic attachment"));
    const oldUrl = await createSignedObjectUrl("messageMedia", "w1/photo.png", 3600);
    const first = await upload("first attachment");
    const second = await upload("second attachment");
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.url).not.toBe(second.url);
    expect(bytesAt(first.url)).toBe("first attachment");
    expect(bytesAt(second.url)).toBe("second attachment");
    expect(bytesAt(oldUrl)).toBe("historic attachment");
    expect(objects.size).toBe(3);
  });

  test("two campaigns persist and re-sign their own media after same-name uploads", async () => {
    campaigns.set(1, { id: 1, message_media: ["legacy.png"] });
    objects.set("messageMedia/w1/legacy.png", Buffer.from("old campaign image"));
    const first = await upload("campaign A image", 1);
    const second = await upload("campaign B image", 2);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.uploadedFileName).toBeTruthy();
    expect(second.uploadedFileName).toBeTruthy();
    expect(first.uploadedFileName).not.toBe(second.uploadedFileName);
    expect(campaigns.get(1)?.message_media).toEqual(["legacy.png", first.uploadedFileName]);
    expect(campaigns.get(2)?.message_media).toEqual([second.uploadedFileName]);
    for (const [id, expected] of [[1, ["old campaign image", "campaign A image"]], [2, ["campaign B image"]]] as const) {
      const urls = await Promise.all((campaigns.get(id)?.message_media ?? []).map(key =>
        createSignedObjectUrl("messageMedia", `w1/${key}`, 3600)));
      expect(urls.map(bytesAt)).toEqual(expected);
    }
    expect(bytesAt(first.url)).toBe("campaign A image");
    expect(bytesAt(second.url)).toBe("campaign B image");
  });

  test("a conditional-write race returns failure without changing or attaching the winning object", async () => {
    vi.mocked(randomUUID).mockReturnValue("11111111-1111-4111-8111-111111111111");
    const first = await upload("winning image", 1);
    expect(first.success).toBe(true);
    const before = [...(campaigns.get(1)?.message_media ?? [])];
    vi.mocked(S3Client.prototype.send).mockImplementation(async (command) => {
      if (command instanceof HeadObjectCommand) {
        throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
      }
      throw Object.assign(new Error("PreconditionFailed"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
    });
    const losing = await upload("losing image", 1);
    expect(losing.status).toBe(409);
    expect(losing.success).toBe(false);
    expect(losing.url).toBeUndefined();
    expect(campaigns.get(1)?.message_media).toEqual(before);
    expect(bytesAt(first.url)).toBe("winning image");
  });

  test.each([{ campaignId: undefined }, { campaignId: 1 }])(
    "a forced collision fails without attaching or changing bytes (campaign $campaignId)",
    async ({ campaignId }) => {
      vi.mocked(randomUUID).mockReturnValue("11111111-1111-4111-8111-111111111111");
      const first = await upload("original", campaignId);
      expect(first.success).toBe(true);
      const before = [...(campaigns.get(1)?.message_media ?? [])];
      const second = await upload("replacement", campaignId);
      expect(second.success).toBe(false);
      expect(second.status).toBe(409);
      expect(second.url).toBeUndefined();
      expect(second.uploadedFileName).toBeUndefined();
      expect(campaigns.get(1)?.message_media).toEqual(before);
      expect(bytesAt(first.url)).toBe("original");
      expect(objects.size).toBe(1);
    },
  );
});
