export { loader } from "./accept-invite.loader.server";
export { action } from "./accept-invite.action.server";

import { useActionData, useLoaderData, useNavigation, NavLink } from "react-router";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { AuthCard } from "@/components/shared/AuthCard";
import { Button } from "@/components/ui/button";
import { NewUserSignup } from "@/components/invite/welcome/NewUserSignUp";
import { ExistingUserInvites } from "@/components/invite/welcome/ExistingUserInvites";
import type {
  ActionData,
  ExistingUserInvite,
  LoaderData,
} from "./accept-invite.types";

type NavigationState = ReturnType<typeof useNavigation>["state"];

interface VerifiedNewUserProps {
  email: string | null;
  state: NavigationState;
}

function VerifiedNewUser({ email, state }: VerifiedNewUserProps) {
  return <NewUserSignup email={email ?? ""} state={state} />;
}

interface ExistingUserProps {
  invites: ExistingUserInvite[];
  state: NavigationState;
}

function ExistingUser({ invites, state }: ExistingUserProps) {
  if (invites.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p>No new invitations.</p>
        <Button asChild>
          <NavLink to="/workspaces">Workspaces</NavLink>
        </Button>
      </div>
    );
  }
  return <ExistingUserInvites invites={invites as any} state={state} />;
}

function NotSignedIn() {
  return (
    <div className="flex flex-col gap-2">
      <p className="">Sign in to see your available invitations.</p>
      <Button asChild className="font-Zilla-Slab text-lg">
        <NavLink to="/signin?next=/accept-invite">Sign in</NavLink>
      </Button>
    </div>
  );
}

export default function AcceptInvite() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const { state } = useNavigation();
  const verifiedEmail =
    loaderData.status === "verified" ? loaderData.email ?? "" : "";

  useActionFeedback(state === "idle" ? actionData : undefined, {
    getSuccess: (data) =>
      data?.status === "updated",
    successMessage: "Successfully signed up and accepted invitation",
    getError: (data) =>
      data?.status === "accept_failed"
        ? "accept_failed"
        : data && "error" in data
          ? data.error
          : undefined,
    errorMessage: "We could not accept all invitations. Please try again.",
  });

  return (
    <main className="relative flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-12 text-foreground">
      <AuthCard
        title="Accept your invitations"
        description="Review and accept workspace invitations sent to your email."
        id="accept-invite-hero"
      >
        {loaderData.status === "verified" && (
          <VerifiedNewUser email={verifiedEmail} state={state} />
        )}
        {loaderData.status === "existing_user" && (
          <ExistingUser invites={loaderData.invites} state={state} />
        )}
        {loaderData.status === "not_signed_in" && <NotSignedIn />}
        {loaderData.status === "invalid_link" && (
          <div>{loaderData.error}</div>
        )}
        {loaderData.status === "error" && <div>{loaderData.error}</div>}
        {loaderData.status === "verified" && actionData?.status === "error" && (
          <div>{actionData.error}</div>
        )}
        {actionData?.status === "accept_failed" && (
          <div>Some invitations could not be accepted. Please review and try again.</div>
        )}
      </AuthCard>
    </main>
  );
}
