import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMessagePageForContact: vi.fn(),
  createSignedObjectUrls: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/message-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/message-db.server")>()),
  fetchMessagePageForContact: (...args: unknown[]) => mocks.fetchMessagePageForContact(...args),
}));
vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  createSignedObjectUrls: (...args: unknown[]) => mocks.createSignedObjectUrls(...args),
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));

import { fetchMessagePage } from "../app/lib/chats/fetch-message-page.server";

describe("fetchMessagePage", () => {
  beforeEach(() => {
    mocks.fetchMessagePageForContact.mockReset();
    mocks.createSignedObjectUrls.mockReset();
    mocks.logger.warn.mockReset();
  });

  test("signs each inbound MMS attachment and leaves text-only messages empty", async () => {
    // Rows arrive newest-first from the db helper; the page is returned oldest-first.
    mocks.fetchMessagePageForContact.mockResolvedValue({
      hasMore: false,
      messages: [
        { sid: "SM2", direction: "outbound", body: "reply", inbound_media: null },
        {
          sid: "SM1",
          direction: "inbound",
          body: "photo",
          inbound_media: ["ws1/sms-SM1-0-2026", "ws1/sms-SM1-1-2026"],
        },
      ],
    });
    mocks.createSignedObjectUrls.mockResolvedValue([
      { path: "ws1/sms-SM1-0-2026", signedUrl: "https://s3/a?sig", error: null },
      { path: "ws1/sms-SM1-1-2026", signedUrl: "https://s3/b?sig", error: null },
    ]);

    const page = await fetchMessagePage({ workspaceId: "ws1", contactFilter: "+15555550100" });

    expect(mocks.createSignedObjectUrls).toHaveBeenCalledWith(
      "messageMedia",
      ["ws1/sms-SM1-0-2026", "ws1/sms-SM1-1-2026"],
      expect.any(Number),
    );
    expect(page.messages.map((m) => [m.sid, m.signedUrls])).toEqual([
      ["SM1", ["https://s3/a?sig", "https://s3/b?sig"]],
      ["SM2", []],
    ]);
  });

  test("skips a key that failed to sign and logs it, without dropping the message", async () => {
    mocks.fetchMessagePageForContact.mockResolvedValue({
      hasMore: true,
      messages: [{ sid: "SM1", direction: "inbound", inbound_media: ["k1", "k2"] }],
    });
    mocks.createSignedObjectUrls.mockResolvedValue([
      { path: "k1", signedUrl: null, error: "NoSuchKey" },
      { path: "k2", signedUrl: "https://s3/k2?sig", error: null },
    ]);

    const page = await fetchMessagePage({ workspaceId: "ws1", contactFilter: "+15555550100" });

    expect(page.hasMore).toBe(true);
    expect(page.messages[0]?.signedUrls).toEqual(["https://s3/k2?sig"]);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "chat inbound media could not be signed",
      expect.objectContaining({ key: "k1", error: "NoSuchKey" }),
    );
  });

  test("does not call the signer for a page with no inbound media", async () => {
    mocks.fetchMessagePageForContact.mockResolvedValue({
      hasMore: false,
      messages: [{ sid: "SM1", direction: "outbound", outbound_media: ["https://cdn/x.png"] }],
    });

    const page = await fetchMessagePage({ workspaceId: "ws1", contactFilter: "+15555550100" });

    expect(mocks.createSignedObjectUrls).not.toHaveBeenCalled();
    expect(page.messages[0]?.signedUrls).toEqual([]);
  });
});
