/**
 * Email-first accept flow (#1713 / SEC-03).
 *
 * Invites accept ONLY through the emailed link, which carries
 * `invitationId` + the one-time `token`. The loader resolves the invite and
 * routes between signup (no account for that email), sign-in (account exists),
 * and an in-session redeem form.
 */

export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  workspace: { name: string; id: string };
};

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
      invites: PendingInvitation[];
      email: string;
    }
  | {
      status: "redeem_ready";
      workspaceName: string;
      invitationId: string;
      token: string;
      alreadyMember: boolean;
    }
  | {
      status: "error";
      error: string;
    };

export type ActionData =
  | {
      status: "updated";
      invites: PendingInvitation[];
    }
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