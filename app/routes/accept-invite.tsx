export { loader } from "./accept-invite.loader.server";
export { action } from "./accept-invite.action.server";

import { useActionData, useLoaderData, useNavigation, NavLink, Form } from "react-router";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { AuthCard } from "@/components/shared/AuthCard";
import { Button } from "@/components/ui/button";
import { NewUserSignup } from "@/components/invite/welcome/NewUserSignUp";
import { ExistingUserInvites } from "@/components/invite/welcome/ExistingUserInvites";
import type { ActionData, LoaderData } from "./accept-invite.types";

type NavigationState = ReturnType<typeof useNavigation>["state"];

function SignInRequired({
  workspaceName,
  invitationId,
  token,
}: {
  workspaceName: string;
  invitationId: string;
  token: string;
}) {
  const next = `/accept-invite?invitationId=${encodeURIComponent(invitationId)}&token=${encodeURIComponent(token)}`;
  return (
    <div className="flex flex-col gap-2">
      <p>You already have an account for the invited email. Sign in to accept the invitation to <strong>{workspaceName}</strong>.</p>
      <Button asChild>
        <NavLink to={`/signin?next=${encodeURIComponent(next)}`}>Sign in</NavLink>
      </Button>
    </div>
  );
}

function RedeemReady({
  workspaceName,
  invitationId,
  token,
  state,
}: {
  workspaceName: string;
  invitationId: string;
  token: string;
  state: NavigationState;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p>You're invited to join <strong>{workspaceName}</strong>. Accept to get started.</p>
      <Form method="POST">
        <input type="hidden" name="actionType" value="redeemInvitation" />
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="token" value={token} />
        <Button type="submit" disabled={state === "submitting"}>
          Accept invitation
        </Button>
      </Form>
    </div>
  );
}

export default function AcceptInvite() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const { state } = useNavigation();

  useActionFeedback(state === "idle" ? actionData : undefined, {
    getSuccess: (data) => data?.status === "updated" || data?.status === "resend_sent",
    successMessage: "Invitation link sent",
    getError: (data) =>
      data?.status === "accept_failed"
        ? data.error
        : data && "error" in data
          ? data.error
          : undefined,
    errorMessage: "We could not accept the invitation. Please try again.",
  });

  return (
    <main className="relative flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-12 text-foreground">
      <AuthCard
        title="Accept your invitation"
        description="Review and accept workspace invitations sent to your email."
        id="accept-invite-hero"
      >
        {loaderData.status === "invalid_link" && (
          <div>{loaderData.error}</div>
        )}
        {loaderData.status === "not_signed_in" && (
          <div className="flex flex-col gap-2">
            <p className="">Sign in to see your available invitations.</p>
            <Button asChild className="font-Zilla-Slab text-lg">
              <NavLink to="/signin?next=/accept-invite">Sign in</NavLink>
            </Button>
          </div>
        )}
        {loaderData.status === "create_account" && (
          <>
            <p>
              Create an account with <strong>{loaderData.email}</strong> to accept the invitation to{" "}
              <strong>{loaderData.workspaceName}</strong>.
            </p>
            <NewUserSignup
              email={loaderData.email}
              state={state}
              invitationId={loaderData.invitationId}
              token={loaderData.token}
            />
          </>
        )}
        {loaderData.status === "sign_in_required" && (
          <SignInRequired
            workspaceName={loaderData.workspaceName}
            invitationId={loaderData.invitationId}
            token={loaderData.token}
          />
        )}
        {loaderData.status === "redeem_ready" && (
          <RedeemReady
            workspaceName={loaderData.workspaceName}
            invitationId={loaderData.invitationId}
            token={loaderData.token}
            state={state}
          />
        )}
        {loaderData.status === "existing_user" &&
          (loaderData.invites.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p>No new invitations.</p>
              <Button asChild>
                <NavLink to="/workspaces">Workspaces</NavLink>
              </Button>
            </div>
          ) : (
            <ExistingUserInvites invites={loaderData.invites} state={state} />
          ))}
        {loaderData.status === "error" && <div>{loaderData.error}</div>}
        {actionData?.status === "accept_failed" && (
          <div role="alert">{actionData.error}</div>
        )}
      </AuthCard>
    </main>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";