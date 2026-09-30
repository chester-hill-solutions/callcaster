import { getSession } from "@/lib/auth.server";
import { isSignupOpen } from "@/lib/env.server";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { auth } from "@/server/auth-instance";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";
import { toUserMessage } from "@/lib/user-message";
import { sendWorkspaceInviteEmail } from "@/lib/send-workspace-invite-email.server";
import { rateLimitedPostAuth } from "@/lib/platform-auth-rate-limit.server";
import {
  redeemWorkspaceInvitation,
  resendWorkspaceInvitation,
} from "@/lib/workspace-invitations.server";
import type {
  AcceptInviteAction,
  ActionData,
} from "./accept-invite.types";
import { acceptInviteActionSchema } from "./accept-invite.types";

type ActionContext<
  T extends AcceptInviteAction["actionType"] = AcceptInviteAction["actionType"],
> = {
  body: Extract<AcceptInviteAction, { actionType: T }>;
  session: Awaited<ReturnType<typeof getSession>>;
  requestHeaders: Headers;
};

function invalidSubmission(headers: Headers) {
  return routeData<ActionData>(
    { status: "error", error: "Invalid form submission." },
    { headers, status: 400 },
  );
}

async function redeemInvitationAction(ctx: ActionContext<"redeemInvitation">) {
  const { body, session, requestHeaders } = ctx;
  const { invitationId, token } = body;
  const sessionUser = session.user;
  if (!sessionUser) {
    return routeData<ActionData>(
      {
        status: "error",
        error: "Sign in to accept this invitation.",
      },
      { headers: requestHeaders, status: 401 },
    );
  }

  const result = await redeemWorkspaceInvitation({
    invitationId,
    rawToken: token,
    userId: sessionUser.id,
    verifiedEmail: sessionUser.email ?? "",
  });
  if (!result.ok) {
    return routeData<ActionData>(
      { status: "accept_failed", error: result.error },
      { headers: requestHeaders, status: result.status },
    );
  }
  return redirect("/workspaces?invite=accepted", { headers: requestHeaders });
}

async function resendInvitationAction(ctx: ActionContext<"resendInvitation">) {
  const { body, session, requestHeaders } = ctx;
  const { invitationId } = body;
  const sessionEmail = session.user?.email?.toLowerCase().trim();
  if (!sessionEmail) {
    return routeData<ActionData>(
      { status: "error", error: "Sign in to resend this invitation." },
      { headers: requestHeaders, status: 401 },
    );
  }
  try {
    const { invitation, rawToken } = await resendWorkspaceInvitation(
      invitationId,
    );
    await sendWorkspaceInviteEmail({
      workspaceId: invitation.workspaceId,
      email: invitation.email,
      role: invitation.roleId,
      invitationId: invitation.id,
      rawToken,
    });
    return routeData<ActionData>({ status: "resend_sent" }, { headers: requestHeaders });
  } catch (error) {
    logger.error("resend_invitation.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return routeData<ActionData>(
      {
        status: "error",
        error: "Could not resend the invitation.",
      },
      { headers: requestHeaders, status: 500 },
    );
  }
}

/**
 * Registration branch. Registers the invited address and claims the invite in
 * the same request (SEC-03 / #1713). The `updateUser` variant of
 * `acceptInviteActionSchema` cannot exist without `invitationId` + `token`, so
 * there is no path here that creates an account for an arbitrary address —
 * which is what #2219 was. Validity of the link is settled by
 * `redeemWorkspaceInvitation`; the schema only guarantees it is present.
 */
async function signUpAndClaimAction(ctx: ActionContext<"updateUser">) {
  const { body, requestHeaders } = ctx;
  const { email: emailValue, password: passwordValue, invitationId, token } =
    body;
  if (!isSignupOpen()) {
    return routeData<ActionData>(
      { status: "error", error: "Registration is closed." },
      { headers: requestHeaders, status: 403 },
    );
  }
  try {
    const name =
      [body.firstName, body.lastName].filter(Boolean).join(" ").trim() ||
      emailValue;
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: emailValue,
        password: passwordValue,
        name,
      },
      headers: ctx.requestHeaders,
      returnHeaders: true,
    });

    const payload = signUpResult?.response ?? signUpResult;
    const user = payload?.user;
    if (!user) {
      throw new Error("Unable to retrieve updated user.");
    }

    const responseHeaders = mergeBetterAuthSetCookieHeaders(
      signUpResult?.headers,
      requestHeaders,
    );

    // The invite is claimed unconditionally. When this fails the account was
    // still created, so the response carries Better Auth's set-cookie and the
    // user lands signed-in on a page that can explain what happened.
    const result = await redeemWorkspaceInvitation({
      invitationId,
      rawToken: token,
      userId: user.id,
      verifiedEmail: user.email ?? emailValue,
    });
    if (!result.ok) {
      return routeData<ActionData>(
        { status: "accept_failed", error: result.error },
        { headers: responseHeaders, status: result.status },
      );
    }
    return redirect("/workspaces?invite=accepted", {
      headers: responseHeaders,
    });
  } catch (error) {
    logger.error("Error in signUpEmail:", error);
    return routeData<ActionData>(
      {
        status: "error",
        // Better Auth's messages are lowercase ("email taken"), which
        // toUserMessage treats as not-user-facing — so the fallback is what
        // this flow actually shows. Make it actionable rather than generic.
        error: toUserMessage(
          error,
          "Could not create your account. That email may already be registered — try signing in instead.",
        ),
      },
      { headers: requestHeaders, status: 500 },
    );
  }
}

export const action = defineAction({
  // #2219: this route creates accounts, so it shares the signup bucket. The
  // limiter is the bound on provisioning cost even now that a valid invite is
  // required, because `isSignupOpen()` ships true in `.env.example`.
  auth: async (args) =>
    (await rateLimitedPostAuth("auth:register")(args)) ??
    getSession(args.request),
  sideEffects: ["db-write", "email"],
  handler: async ({ request, auth: session }) => {
    const { headers } = session;

    // One parse, one discriminant, exhaustive dispatch. Each branch receives
    // only the fields its own variant declares, so a branch cannot read a
    // field it never validated.
    const parsed = acceptInviteActionSchema.safeParse(
      Object.fromEntries((await request.formData()).entries()),
    );
    if (!parsed.success) {
      return invalidSubmission(headers);
    }
    const body = parsed.data;
    const ctx = { body, session, requestHeaders: headers } as ActionContext;

    switch (body.actionType) {
      case "redeemInvitation":
        return redeemInvitationAction(ctx as ActionContext<"redeemInvitation">);
      case "resendInvitation":
        return resendInvitationAction(ctx as ActionContext<"resendInvitation">);
      case "updateUser":
        return signUpAndClaimAction(ctx as ActionContext<"updateUser">);
    }
  },
});