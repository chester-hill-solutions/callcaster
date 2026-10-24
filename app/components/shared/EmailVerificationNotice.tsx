import { NavLink } from "react-router";

import { Button } from "@/components/ui/button";

/**
 * The pending-verification state, shared by the two paths that create an
 * account without a session: /signup and the invitation signup form.
 *
 * `requireEmailVerification` means neither can hand the browser a session
 * (app/server/auth-instance.ts), so both end here instead of redirecting to
 * /workspaces and bouncing straight back to sign-in.
 *
 * The copy names no link type on purpose. A sign-up for an address that already
 * has an account is answered with a synthetic user and a *different* email
 * (`onExistingUserSignUp`), so "verification link" would be untrue there and
 * would hint that the address is taken. Both outcomes send an email; that is all
 * this says.
 */
export function EmailVerificationNotice({
  email,
  detail,
}: {
  email: string;
  detail?: string;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <p className="font-Zilla-Slab text-lg">
        We sent an email to <strong>{email}</strong>.
      </p>
      <p className="text-muted-foreground">
        {detail ?? "Open the link in it to continue."}
      </p>
      <Button asChild className="w-full">
        <NavLink to="/signin">Go to sign in</NavLink>
      </Button>
    </div>
  );
}
