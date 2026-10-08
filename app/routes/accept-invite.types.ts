/**
 * Email-first accept flow (#1713 / SEC-03).
 *
 * Invites accept ONLY through the emailed link, which carries
 * `invitationId` + the one-time `token`. The loader resolves the invite and
 * routes between signup (no account for that email), sign-in (account exists),
 * and an in-session redeem form.
 *
 * #2219: the action used to dispatch on a raw `actionType` form field and let
 * each branch hand-parse its own fields, so the registration branch could run
 * with no invite at all. The discriminant is a schema instead, and every
 * variant carries the fields its branch is allowed to touch. `updateUser`
 * having no variant without a token is what makes a tokenless signup
 * unrepresentable rather than merely discouraged.
 */

import { z } from "zod";

import type { PendingUserInvitation } from "@/lib/workspace-invitations.server";

const inviteLinkFields = {
  invitationId: z.string().min(1),
  token: z.string().min(1),
};

export const acceptInviteActionSchema = z.discriminatedUnion("actionType", [
  z.object({ actionType: z.literal("redeemInvitation"), ...inviteLinkFields }),
  z.object({
    actionType: z.literal("resendInvitation"),
    invitationId: z.string().min(1),
  }),
  z.object({
    actionType: z.literal("updateUser"),
    ...inviteLinkFields,
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string(),
    lastName: z.string(),
  }),
]);

export type AcceptInviteAction = z.infer<typeof acceptInviteActionSchema>;

export type LoaderData =
  | {
      status: "invalid_link";
      error: string;
    }
  | {
      status: "not_signed_in";
    }
  | {
      status: "create_account";
      email: string;
      invitationId: string;
      token: string;
      workspaceName: string;
    }
  | {
      status: "sign_in_required";
      email: string;
      invitationId: string;
      token: string;
      workspaceName: string;
    }
  | {
      status: "existing_user";
      invites: PendingUserInvitation[];
      email: string;
    }
  | {
      status: "redeem_ready";
      workspaceName: string;
      invitationId: string;
      token: string;
    }
  | {
      status: "error";
      error: string;
    };

export type ActionData =
  | {
      status: "redeemed";
    }
  | {
      status: "resend_sent";
    }
  | {
      status: "accept_failed";
      error: string;
    }
  | {
      status: "error";
      error: string;
    };