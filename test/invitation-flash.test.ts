import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createCookie } from "react-router";
import { appendInvitationAcceptedFlash, consumeInvitationFlash } from "@/lib/invitation-flash.server";

vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return { ...actual, env: { ...actual.env, BETTER_AUTH_SECRET: () => "feedback-test-secret" } };
});

const now = new Date("2026-10-04T12:00:00Z");
const id = "fcbd2b41-9466-45f3-b7d0-cba4c02e5666";
const request = (cookie = "", protocol = "https") => new Request(`${protocol}://localhost/workspaces`, { headers: { Cookie: cookie } });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

async function signed(value: unknown, secret = "feedback-test-secret") {
  return createCookie("cc.flash", { secrets: [secret] }).serialize(value);
}

describe("invitation receipt cookie", () => {
  test("signs a five-minute allow-listed receipt and appends it without replacing auth cookies", async () => {
    const headers = new Headers([["Set-Cookie", "session=keep; Path=/"], ["Set-Cookie", "session-data=keep; Path=/"]]);
    await appendInvitationAcceptedFlash(request(), headers);
    const cookies = headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    expect(cookies).toEqual(expect.arrayContaining(["session=keep; Path=/", "session-data=keep; Path=/"]));
    const cookie = cookies.find((value) => value.startsWith("cc.flash=")) ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/workspaces");
    expect(cookie).toContain("Max-Age=300");
    const consumed = await consumeInvitationFlash(request(cookie));
    expect(consumed.flash).toEqual({ code: "invite_accepted", id: expect.any(String) });
    expect(consumed.clearCookie).toContain("Max-Age=0");
    expect((await consumeInvitationFlash(request(consumed.clearCookie))).flash).toBeNull();
    vi.setSystemTime(new Date(now.getTime() + 300_000));
    expect((await consumeInvitationFlash(request(cookie))).flash).toBeNull();
  });

  test.each([
    { name: "unknown code", value: { code: "attacker_message", id, expiresAt: now.getTime() + 1000 } },
    { name: "arbitrary message", value: { code: "invite_accepted", id, expiresAt: now.getTime() + 1000, message: "attacker text" } },
    { name: "expired receipt", value: { code: "invite_accepted", id, expiresAt: now.getTime() - 1 } },
    { name: "excessive lifetime", value: { code: "invite_accepted", id, expiresAt: now.getTime() + 600_000 } },
    { name: "invalid id", value: { code: "invite_accepted", id: "bad", expiresAt: now.getTime() + 1000 } },
  ])("clears and ignores $name even with a valid signature", async ({ value }) => {
    const result = await consumeInvitationFlash(request(await signed(value)));
    expect(result.flash).toBeNull();
    expect(result.clearCookie).toContain("Max-Age=0");
  });

  test("rejects a different signer and malformed unsigned content", async () => {
    const cookie = await signed({ code: "invite_accepted", id, expiresAt: now.getTime() + 1000 }, "wrong-secret");
    const unsigned = await createCookie("cc.flash").serialize({ code: "invite_accepted", id, expiresAt: now.getTime() + 1000 });
    for (const value of [cookie, unsigned, "cc.flash=not-json", "cc.flash=%ZZ"] ) {
      const result = await consumeInvitationFlash(request(value));
      expect(result.flash).toBeNull();
      expect(result.clearCookie).toContain("Max-Age=0");
    }
  });
});
