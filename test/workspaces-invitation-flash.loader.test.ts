import { beforeEach, describe, expect, test, vi } from "vitest";
import { appendInvitationAcceptedFlash } from "@/lib/invitation-flash.server";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), list: vi.fn(), twoFactor: vi.fn() }));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()), getSession: mocks.getSession,
}));
vi.mock("@/lib/platform-workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-workspace.server")>()), listUserWorkspaces: mocks.list,
}));
vi.mock("@/lib/two-factor.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/two-factor.server")>()), requireTwoFactorEnrollmentForPrivilegedUser: mocks.twoFactor,
}));

beforeEach(() => {
  mocks.getSession.mockReset(); mocks.list.mockReset(); mocks.twoFactor.mockReset();
  mocks.getSession.mockResolvedValue({ user: { id: "u1" }, headers: new Headers([["Set-Cookie", "session=refreshed; Path=/"], ["Set-Cookie", "session-data=keep; Path=/"]]) });
  mocks.list.mockResolvedValue({ ok: true, workspaces: [{ workspace: { id: "w1", name: "Workspace" }, role: "owner", last_accessed: null }] });
});

async function rawLoad(cookie: string) {
  const mod = await import("../app/routes/workspaces+/index.loader.server");
  const request = new Request("http://localhost/workspaces", { headers: { Cookie: cookie } });
  return mod.loader({ request, url: new URL(request.url), params: {}, context: {} } as never);
}
async function load(cookie: string) { return asRouteResponse(rawLoad(cookie)); }
async function issuedCookie() {
  const headers = await appendInvitationAcceptedFlash(new Request("http://localhost/accept-invite"), new Headers());
  return headers.getSetCookie()[0];
}

function expectCleared(headers: Headers) {
  expect(headers.getSetCookie().find((value) => value.startsWith("cc.flash="))).toContain("Max-Age=0");
}

describe("workspace invitation receipt consumption", () => {
  test("returns the signed receipt once and preserves refreshed session cookies", async () => {
    const first = await load(await issuedCookie());
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ flash: { code: "invite_accepted", id: expect.any(String) }, workspaces: [{ workspace: { id: "w1" } }] });
    expectCleared(first.headers);
    expect(first.headers.getSetCookie()).toEqual(expect.arrayContaining(["session=refreshed; Path=/", "session-data=keep; Path=/"]));
    const clearedCookie = first.headers.getSetCookie().find((value) => value.startsWith("cc.flash=")) ?? "";
    const next = await load(clearedCookie);
    await expect(next.json()).resolves.toMatchObject({ flash: null });
  });

  test.each(["cc.flash=not-json", "cc.flash=%ZZ", ""]) ("ignores invalid or absent feedback %s and clears it", async (cookie) => {
    const response = await load(cookie);
    await expect(response.json()).resolves.toMatchObject({ flash: null });
    expectCleared(response.headers);
  });

  test.each(["returned failure", "thrown failure"]) ("clears the receipt on %s without exposing backend details", async (mode) => {
    if (mode === "returned failure") mocks.list.mockResolvedValueOnce({ ok: false, error: "private SQL details" });
    else mocks.list.mockRejectedValueOnce(new Error("private SQL details"));
    const response = await load(await issuedCookie());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ workspaces: null, error: "Failed to load workspaces. Please refresh and try again.", flash: { code: "invite_accepted" } });
    expectCleared(response.headers);
    expect(response.headers.getSetCookie()).toContain("session=refreshed; Path=/");
  });

  test("clears the receipt when authentication redirects before workspace loading", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: null, headers: new Headers() });
    const response = await rawLoad(await issuedCookie()).catch((value: unknown) => value);
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) throw new Error("Expected auth redirect");
    expect(response.headers.get("Location")).toBe("/signin?next=%2Fworkspaces");
    expectCleared(response.headers);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  test("clears the receipt on a two-factor redirect while keeping its cookies", async () => {
    mocks.twoFactor.mockRejectedValueOnce(new Response(null, { status: 302, headers: { Location: "/account/security", "Set-Cookie": "two-factor=pending; Path=/" } }));
    const response = await rawLoad(await issuedCookie()).catch((value: unknown) => value);
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) throw new Error("Expected two-factor redirect");
    expect(response.headers.get("Location")).toBe("/account/security");
    expect(response.headers.getSetCookie()).toContain("two-factor=pending; Path=/");
    expectCleared(response.headers);
  });

  test("clears the receipt on an unexpected authentication failure without success feedback", async () => {
    mocks.getSession.mockRejectedValueOnce(new Error("private auth database details"));
    const response = await load(await issuedCookie());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ workspaces: null, error: "Failed to load workspaces. Please refresh and try again.", flash: null });
    expectCleared(response.headers);
  });
});
