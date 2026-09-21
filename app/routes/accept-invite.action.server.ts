import { getSession } from "@/lib/auth.server";
import { isSignupOpen } from "@/lib/env.server";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { auth } from "@/server/auth-instance";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";
import { toUserMessage } from "@/lib/user-message";
import { sendWorkspaceInviteEmail } from "@/lib/send-workspace-invite-email.server";
import {
  listUserPendingInvitationsByEmail,
  redeemWorkspaceInvitation,
  resendWorkspaceInvitation,
} from "@/lib/workspace-invitations.server";
import type { ActionData } from "./accept-invite.types";

type ActionContext = {
  formData: FormData;
  session: Awaited<ReturnType<typeof getSession>>;
  requestHeaders: Headers;
};

async function redeemInvitationAction(
  ctx: ActionContext,
) {
  const { formData, session, requestHeaders } = ctx;
  const invitationId = formData.get("invitationId");
  const token = formData.get("token");
  const sessionUser = session.user;
  if (
    !invitationId ||
    !token ||
    typeof invitationId !== "string" ||
    typeof token !== "string" ||
    !sessionUser
  ) {
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

async function resendInvitationAction(
  ctx: ActionContext,
) {
  const { formData, session, requestHeaders } = ctx;
  const invitationId = formData.get("invitationId");
  const sessionEmail = session.user?.email?.toLowerCase().trim();
  if (!invitationId || typeof invitationId !== "string" || !sessionEmail) {
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
 * Registration branch. This creates an account for whatever email the form
 * carries, so it must honor the same signup gate. The email-first invite
 * (SEC-03 / #1713) is claimed right after signup, in the same request, when
 * the form came from an emailed accept link.
 */
async function signUpAndClaimAction(
  ctx: ActionContext,
) {
  const { formData, requestHeaders } = ctx;
  if (!isSignupOpen()) {
    return routeData<ActionData>(
      { status: "error", error: "Registration is closed." },
      { headers: requestHeaders, status: 403 },
    );
  }
  try {
    const entries = Object.fromEntries(formData.entries()) as Record<
      string,
      FormDataEntryValue
    >;

    const emailValue = entries.email;
    const passwordValue = entries.password;
    const firstNameValue = entries.firstName;
    const lastNameValue = entries.lastName;

    if (
      typeof emailValue !== "string" ||
      typeof passwordValue !== "string" ||
      typeof firstNameValue !== "string" ||
      typeof lastNameValue !== "string"
    ) {
      return routeData<ActionData>(
        {
          status: "error",
          error: "Invalid form submission.",
        },
        { headers: requestHeaders, status: 400 },
      );
    }

    const name = [firstNameValue, lastNameValue].filter(Boolean).join(" ").trim() || emailValue;
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

    const invitationId = formData.get("invitationId");
    const token = formData.get("token");
    if (
      invitationId &&
      token &&
      typeof invitationId === "string" &&
      typeof token === "string"
    ) {
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
    }

    const invites = await listUserPendingInvitationsByEmail(
      emailValue.toLowerCase().trim(),
    );
    const mapped = invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      created_at: invite.created_at,
      expires_at: invite.expires_at,
      workspace: invite.workspace,
    }));

    return routeData<ActionData>(
      { status: "updated", invites: mapped },
      { headers: responseHeaders },
    );
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
  auth: ({ request }) => getSession(request),
  sideEffects: ["db-write", "email"],
  handler: async ({ request, auth: session }) => {
    const { headers } = session;
    const formData = await request.formData();
    const actionType = formData.get("actionType");
    const ctx: ActionContext = {
      formData,
      session,
      requestHeaders: headers,
    };

    if (actionType === "redeemInvitation") {
      return redeemInvitationAction(ctx);
    }
    if (actionType === "resendInvitation") {
      return resendInvitationAction(ctx);
    }
    if (actionType === "updateUser") {
      return signUpAndClaimAction(ctx);
    }

    return routeData<ActionData>({ status: "error", error: "Invalid action type" }, { headers, status: 400 });
  },
});