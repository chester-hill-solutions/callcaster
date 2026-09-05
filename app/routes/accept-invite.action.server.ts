import {
  acceptWorkspaceInvitations,
  getInvitesByUserId,
} from "@/lib/database/workspace.server";
import { getSession, verifyAuth } from "@/lib/auth.server";
import { isSignupOpen } from "@/lib/env.server";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { auth } from "@/server/auth-instance";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";
import { toUserMessage } from "@/lib/user-message";
import type { ActionData } from "./accept-invite.types";
import type { Database } from "@/lib/db-types";
import type { User } from "@/lib/types";

export const action = defineAction({
  auth: ({ request }) => getSession(request),
  sideEffects: ["db-write", "email"],
  handler: async ({ request, auth: session }) => {
    const { headers } = session;
    const formData = await request.formData();
    const actionType = formData.get("actionType");

    if (actionType === "updateUser") {
      // This branch creates an account for whatever email the form carries;
      // invites are keyed by an existing user id, so nothing here proves an
      // invite exists. It is registration and must honor the same gate.
      if (!isSignupOpen()) {
        return routeData<ActionData>(
          { status: "error", error: "Registration is closed." },
          { headers, status: 403 },
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
            { headers, status: 400 },
          );
        }

        const name = [firstNameValue, lastNameValue].filter(Boolean).join(" ").trim() || emailValue;
        const signUpResult = await auth.api.signUpEmail({
          body: {
            email: emailValue,
            password: passwordValue,
            name,
          },
          headers: request.headers,
          returnHeaders: true,
        });

        const payload = signUpResult?.response ?? signUpResult;
        const user = payload?.user;
        if (!user) {
          throw new Error("Unable to retrieve updated user.");
        }

        const responseHeaders = mergeBetterAuthSetCookieHeaders(
          signUpResult?.headers,
          headers,
        );
        const invites = await getInvitesByUserId(user.id);

        return routeData<ActionData>(
          { status: "updated", invites: invites ?? [] },
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
          { headers, status: 500 },
        );
      }
    }

    if (actionType === "acceptInvitations") {
      const authContext = await verifyAuth(request);

      const invitationIds = formData
        .getAll("invitation_id")
        .map((value) => (typeof value === "string" ? value : ""))
        .filter((value): value is string => Boolean(value));

      if (invitationIds.length === 0) {
        return routeData<ActionData>(
          {
            status: "error",
            error: "No invitations were selected.",
          },
          { headers: authContext.headers, status: 400 },
        );
      }

      const result = await acceptWorkspaceInvitations(
        invitationIds,
        authContext.user.id,
      );
      const errors = result?.errors ?? [];

      if (errors.length > 0) {
        return routeData<ActionData>(
          {
            status: "accept_failed",
            errors,
          },
          { headers: authContext.headers, status: 400 },
        );
      }

      return redirect("/workspaces?invite=accepted", {
        headers: authContext.headers,
      });
    }

    return routeData<ActionData>({ status: "error", error: "Invalid action type" }, { headers, status: 400 });
  },
});
