import { redirect } from "react-router";
import type { MiddlewareFunction } from "react-router";
import { getSession } from "@/lib/auth.server";
import { getUserById } from "@/lib/workspace-members-db.server";
import { requireTwoFactorEnrollmentForPrivilegedUser } from "@/lib/two-factor.server";
import { adminContext } from "@/lib/route-context.server";
import type { Database } from "@/lib/db-types";

type UserRow = Database["public"]["Tables"]["user"]["Row"];

/**
 * Sudo admin session middleware for `admin+/` layout.
 * Sets `adminContext`; never writes a response body.
 */
export const adminMiddleware: MiddlewareFunction = async (
  { request, context },
  next,
) => {
  const { user, headers } = await getSession(request);
  if (!user) {
    throw redirect("/signin");
  }

  const userData = await getUserById(user.id);
  if (!userData || userData.access_level !== "sudo") {
    throw redirect("/signin");
  }

  // Sudo admins are privileged and must enroll in TOTP 2FA before reaching the
  // admin panel, mirroring the workspace layout. `isPrivileged: true` gates sudo
  // accounts that hold no privileged workspace membership (which the workspace-
  // role check alone would miss). Honors the same E2E bypass as the workspace
  // layout. Throws a redirect to /account/security when unenrolled.
  await requireTwoFactorEnrollmentForPrivilegedUser({
    userId: user.id,
    request,
    isPrivileged: true,
  });

  context.set(adminContext, {
    userId: user.id,
    accessLevel: userData.access_level,
    headers,
    userData: userData as UserRow,
  });

  return next();
};
