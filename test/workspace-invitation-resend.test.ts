import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { InviteError } from "@chester-hill-solutions/auth";
import { RouterContextProvider } from "react-router";
import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  lookup: vi.fn(),
  resend: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  getSession: (...args: unknown[]) => mocks.session(...args),
}));
vi.mock("@/lib/workspace-invitations.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/workspace-invitations.server")
  >()),
  getWorkspaceInvitationById: (...args: unknown[]) => mocks.lookup(...args),
  resendWorkspaceInvitation: (...args: unknown[]) => mocks.resend(...args),
}));
vi.mock("@/lib/send-workspace-invite-email.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/send-workspace-invite-email.server")
  >()),
  sendWorkspaceInviteEmail: (...args: unknown[]) => mocks.send(...args),
}));
const invitation = {
  id: "wi_owned",
  workspace_id: "ws-invited",
  email: "invitee@example.com",
  role_id: "member",
  status: "pending",
};
beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimitsForTests();
  vi.stubEnv("DISABLE_AUTH_RATE_LIMIT", "");
  vi.stubEnv("E2E_DISABLE_AUTH_RATE_LIMIT", "");
  mocks.session.mockResolvedValue({
    user: { id: "u-invitee", email: "invitee@example.com" },
    headers: new Headers({ "x-request": "resend-control" }),
  });
  mocks.lookup.mockResolvedValue(invitation);
  mocks.resend.mockResolvedValue({
    invitation: {
      id: invitation.id,
      workspaceId: invitation.workspace_id,
      email: invitation.email,
      roleId: invitation.role_id,
    },
    rawToken: "new-secret-token",
  });
});
afterEach(() => vi.unstubAllEnvs());
async function resend() {
  const { action } = await import("../app/routes/accept-invite.action.server");
  const request = new Request("https://base.example/accept-invite", {
    method: "POST",
    headers: { "x-forwarded-for": "192.0.2.207" },
    body: new URLSearchParams({
      actionType: "resendInvitation",
      invitationId: invitation.id,
    }),
  });
  return asRouteResponse(
    action({
      request,
      params: {},
      context: new RouterContextProvider(),
      url: new URL(request.url),
    }),
  );
}
describe("invite resend authorization (#2077)", () => {
  test("a foreign email gets 404 before rotation or email delivery", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "u-other", email: "other@example.com" },
      headers: new Headers(),
    });
    const response = await resend();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      status: "error",
      error: "Invitation not found.",
    });
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  test.each([
    null,
    { ...invitation, status: "accepted" },
    { ...invitation, status: "canceled" },
  ])("missing or finalized invite stays hidden (%s)", async (row) => {
    mocks.lookup.mockResolvedValue(row);
    expect((await resend()).status).toBe(404);
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  test("a normalized matching email uses the invitation workspace and sends only the new raw token by email", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "u-invitee", email: "  INVITEE@example.com  " },
      headers: new Headers({ "x-request": "resend-control" }),
    });
    const response = await resend();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "resend_sent" });
    expect(response.headers.get("x-request")).toBe("resend-control");
    expect(mocks.resend).toHaveBeenCalledWith(
      invitation.id,
      invitation.workspace_id,
      "invitee@example.com",
    );
    expect(mocks.send).toHaveBeenCalledWith({
      workspaceId: invitation.workspace_id,
      email: invitation.email,
      role: invitation.role_id,
      invitationId: invitation.id,
      rawToken: "new-secret-token",
    });
  });
  test("a writer race refusal remains 404 and cannot send an email", async () => {
    mocks.resend.mockRejectedValue(
      new InviteError("Invitation not found.", "INVITE_NOT_FOUND", 404),
    );
    expect((await resend()).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  test("unexpected writer failure remains 500 without email delivery", async () => {
    mocks.resend.mockRejectedValue(new Error("Database unavailable"));
    expect((await resend()).status).toBe(500);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  test("an unsigned caller remains 401 without lookup or rotation", async () => {
    mocks.session.mockResolvedValue({ user: null, headers: new Headers() });
    expect((await resend()).status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  test("the existing register limiter stops the eleventh resend before lookup, rotation or email", async () => {
    for (let i = 0; i < 10; i++) expect((await resend()).status).toBe(200);
    const lookupCount = mocks.lookup.mock.calls.length;
    expect((await resend()).status).toBe(429);
    expect(mocks.lookup).toHaveBeenCalledTimes(lookupCount);
    expect(mocks.resend).toHaveBeenCalledTimes(10);
    expect(mocks.send).toHaveBeenCalledTimes(10);
  });
});
