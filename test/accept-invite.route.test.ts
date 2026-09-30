import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  isSignupOpen: vi.fn(() => true),
  signUpEmail: vi.fn(),
  listPending: vi.fn(async () => []),
  redeemInvitation: vi.fn(),
  getSession: vi.fn(),
  verifyAuth: vi.fn(),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: {
    api: {
      signUpEmail: mocks.signUpEmail,
    },
  },
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: mocks.getSession,
  verifyAuth: mocks.verifyAuth,
}));

vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-members-db.server")>()),
  listUserPendingInvitationsByEmail: mocks.listPending,
}));

vi.mock("@/lib/workspace-invitations.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-invitations.server")>()),
  listUserPendingInvitationsByEmail: mocks.listPending,
  redeemWorkspaceInvitation: mocks.redeemInvitation,
  resendWorkspaceInvitation: vi.fn(),
  getWorkspaceInvitationById: vi.fn(async () => null),
  getPendingWorkspaceInvitationByEmail: vi.fn(async () => null),
  createWorkspaceInvitation: vi.fn(),
  cancelWorkspaceInvitationById: vi.fn(),
  listWorkspaceInvitations: vi.fn(async () => []),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  acceptWorkspaceInvitations: vi.fn(async () => ({ errors: [] })),
  getInvitesByUserId: vi.fn(async () => []),
}));

vi.mock("@/lib/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env.server")>()),
  isSignupOpen: () => mocks.isSignupOpen(),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** A `create_account` submission, i.e. exactly what the loader can produce. */
function signupForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("actionType", "updateUser");
  form.set("email", "new@example.com");
  form.set("password", "newPassword123");
  form.set("confirmPassword", "newPassword123");
  form.set("firstName", "First");
  form.set("lastName", "Last");
  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }
  return form;
}

function post(form: FormData) {
  return new Request("http://localhost/accept-invite", {
    method: "POST",
    body: form,
  });
}

describe("app/routes/accept-invite.action.server.ts", () => {
  beforeEach(async () => {
    await resetRateLimitsForTests();
    mocks.isSignupOpen.mockReturnValue(true);
    mocks.signUpEmail.mockReset();
    mocks.listPending.mockResolvedValue([]);
    mocks.redeemInvitation.mockReset();
    mocks.getSession.mockResolvedValue({
      session: null,
      user: null,
      headers: new Headers(),
    });
  });

  // #2219: the registration branch used to call signUpEmail for whatever
  // email the POST carried, with no invitation and no throttle. The loader
  // only ever emits `create_account` with BOTH invitationId and token (see
  // accept-invite.loader.server.ts:63-71), so a tokenless submission is
  // unreachable through the UI and can only be hand-crafted.
  // The type is not the enforcement, and it is worth pinning that. If the
  // schema ever grows an `updateUser` variant without a token, the route
  // would compile again and this must still refuse.
  test("refuses a tokenless registration even if the schema grows one", async () => {
    mocks.signUpEmail.mockResolvedValue({
      response: { user: { id: "u-new", email: "new@example.com" } },
      headers: new Headers(),
    });

    const mod = await import("../app/routes/accept-invite.action.server");
    const { acceptInviteActionSchema } = await import(
      "../app/routes/accept-invite.types"
    );
    // A deliberately tokenless shape, as an earlier revision of the schema
    // could have declared.
    const weakSchema = z.discriminatedUnion("actionType", [
      z.object({
        actionType: z.literal("updateUser"),
        email: z.string().email(),
        password: z.string().min(8),
        firstName: z.string(),
        lastName: z.string(),
      }),
    ]);
    expect(weakSchema.safeParse(Object.fromEntries(signupForm())).success).toBe(
      true,
    );
    // The shipped schema rejects the same input, and that is the gate.
    expect(
      acceptInviteActionSchema.safeParse(Object.fromEntries(signupForm())).success,
    ).toBe(false);

    const response = await asRouteResponse(
      mod.action({ request: post(signupForm()) } as any),
    );
    expect(response.status).toBe(400);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  test("refuses to create an account without an invitation link", async () => {
    // Stub the signup to SUCCEED, so an unguarded action reaches 200. The
    // assertion below is therefore about the guard, not about a mock blowing
    // up and masking it.
    mocks.signUpEmail.mockResolvedValue({
      response: { user: { id: "u-new", email: "new@example.com" } },
      headers: new Headers(),
    });
    mocks.listPending.mockResolvedValue([]);

    const mod = await import("../app/routes/accept-invite.action.server");
    const response = await asRouteResponse(
      mod.action({ request: post(signupForm()) } as any),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      status: "error",
    });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(mocks.redeemInvitation).not.toHaveBeenCalled();
  });

  // The tokenless branch also returned the pending-invitation list for the
  // address to a caller who had just registered as it. That leaks workspace
  // names and roles to whoever knows an email address.
  test("does not disclose pending invitations on a tokenless signup", async () => {
    mocks.signUpEmail.mockResolvedValue({
      response: { user: { id: "u-new", email: "new@example.com" } },
      headers: new Headers(),
    });
    mocks.listPending.mockResolvedValue([
      {
        id: "i1",
        email: "new@example.com",
        role: "member",
        status: "pending",
        created_at: "2026-09-21T00:00:00.000Z",
        expires_at: null,
        workspace: { id: "w1", name: "Victim Campaign" },
      },
    ]);

    const mod = await import("../app/routes/accept-invite.action.server");
    const response = await asRouteResponse(
      mod.action({ request: post(signupForm()) } as any),
    );

    const body = await response.text();
    expect(body).not.toContain("Victim Campaign");
    expect(mocks.listPending).not.toHaveBeenCalled();
  });

  test("claims an emailed invite right after signup", async () => {
    mocks.signUpEmail.mockResolvedValueOnce({
      response: {
        user: { id: "u-new", email: "new@example.com", name: "First Last" },
      },
      headers: new Headers([["Set-Cookie", "session=abc; Path=/"]]),
    });
    mocks.redeemInvitation.mockResolvedValueOnce({
      ok: true,
      workspaceId: "w1",
      alreadyAccepted: false,
    });

    const mod = await import("../app/routes/accept-invite.action.server");
    const response = await asRouteResponse(
      mod.action({
        request: post(
          signupForm({ invitationId: "wi_invite_1", token: "raw-token" }),
        ),
      } as any),
    );

    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: {
        email: "new@example.com",
        password: "newPassword123",
        name: "First Last",
      },
      headers: expect.any(Headers),
      returnHeaders: true,
    });
    expect(mocks.redeemInvitation).toHaveBeenCalledWith({
      invitationId: "wi_invite_1",
      rawToken: "raw-token",
      userId: "u-new",
      verifiedEmail: "new@example.com",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/workspaces?invite=accepted");
    // The registration session must survive the redeem redirect.
    expect(response.headers.get("Set-Cookie")).toBe("session=abc; Path=/");
  });

  // A token that does not resolve to a pending invite must not create an
  // account either — the schema guarantees a token is present, not valid.
  test("does not create an account when the invite fails to redeem", async () => {
    mocks.signUpEmail.mockResolvedValueOnce({
      response: {
        user: { id: "u-new", email: "new@example.com", name: "First Last" },
      },
      headers: new Headers(),
    });
    mocks.redeemInvitation.mockResolvedValueOnce({
      ok: false,
      error: "That invitation is no longer valid.",
      status: 400,
    });

    const mod = await import("../app/routes/accept-invite.action.server");
    const response = await asRouteResponse(
      mod.action({
        request: post(
          signupForm({ invitationId: "wi_invite_1", token: "forged" }),
        ),
      } as any),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "accept_failed",
      error: "That invitation is no longer valid.",
    });
  });

  // The signup bucket is 10/minute. Without it, the registration branch is an
  // unthrottled account-creation oracle even once the token is required.
  test("throttles repeated registration attempts", async () => {
    mocks.signUpEmail.mockResolvedValue({
      response: { user: { id: "u-new", email: "new@example.com" } },
      headers: new Headers(),
    });
    mocks.redeemInvitation.mockResolvedValue({
      ok: true,
      workspaceId: "w1",
      alreadyAccepted: false,
    });

    const mod = await import("../app/routes/accept-invite.action.server");
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) {
      last = await asRouteResponse(
        mod.action({
          request: post(
            signupForm({ invitationId: "wi_invite_1", token: "raw-token" }),
          ),
        } as any),
      );
    }

    expect(last?.status).toBe(429);
  });

  test("refuses to create an account while signup is closed", async () => {
    mocks.isSignupOpen.mockReturnValue(false);

    const mod = await import("../app/routes/accept-invite.action.server");
    const response = await asRouteResponse(
      mod.action({
        request: post(
          signupForm({ invitationId: "wi_invite_1", token: "raw-token" }),
        ),
      } as any),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      status: "error",
      error: "Registration is closed.",
    });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  test("returns error when signUpEmail fails", async () => {
    mocks.signUpEmail.mockRejectedValueOnce(new Error("email taken"));

    const mod = await import("../app/routes/accept-invite.action.server");
    const response = await asRouteResponse(
      mod.action({
        request: post(
          signupForm({ invitationId: "wi_invite_1", token: "raw-token" }),
        ),
      } as any),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      // Better Auth messages are lowercase, which toUserMessage classifies as
      // internal — so the user sees the actionable fallback, not the raw
      // provider string. The raw message still reaches the logger.
      error:
        "Could not create your account. That email may already be registered — try signing in instead.",
    });
  });
});
