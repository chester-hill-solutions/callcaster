import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import { adminDb } from "@/server/admin-db";
import { authUser } from "@/db/auth-schema";
import { workspace_users } from "@/db/schema";

/** Workspace roles that must enroll in TOTP 2FA (owner/admin/field_director per security baseline). */
export const PRIVILEGED_WORKSPACE_ROLES = ["owner", "admin", "field_director"] as const;

export type PrivilegedWorkspaceRole = (typeof PRIVILEGED_WORKSPACE_ROLES)[number];

export async function userHasPrivilegedWorkspaceRole(userId: string): Promise<boolean> {
  const memberships = await adminDb
    .select({ role: workspace_users.role })
    .from(workspace_users)
    .where(eq(workspace_users.user_id, userId));

  return memberships.some((m) =>
    PRIVILEGED_WORKSPACE_ROLES.includes(m.role as PrivilegedWorkspaceRole),
  );
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const [row] = await adminDb
    .select({ twoFactorEnabled: authUser.twoFactorEnabled })
    .from(authUser)
    .where(eq(authUser.id, userId))
    .limit(1);

  return row?.twoFactorEnabled ?? false;
}

/**
 * Redirect privileged-role users who have not enrolled in TOTP to the setup page.
 * Call after session auth on workspace routes.
 */
export async function requireTwoFactorEnrollmentForPrivilegedUser(args: {
  userId: string;
  request: Request;
  nextPath?: string;
}): Promise<void> {
  if (process.env.E2E_DISABLE_2FA_ENFORCEMENT === "1") {
    return;
  }

  const pathname = new URL(args.request.url).pathname;
  if (
    pathname.startsWith("/two-factor") ||
    pathname.startsWith("/account/security") ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/signout") ||
    pathname.startsWith("/api/auth")
  ) {
    return;
  }

  const privileged = await userHasPrivilegedWorkspaceRole(args.userId);
  if (!privileged) {
    return;
  }

  const enrolled = await isTwoFactorEnabled(args.userId);
  if (enrolled) {
    return;
  }

  const next = args.nextPath ?? pathname;
  throw redirect(`/account/security?enroll=1&next=${encodeURIComponent(next)}`);
}

export function isTwoFactorRedirectResponse(
  payload: unknown,
): payload is { twoFactorRedirect: true; twoFactorMethods?: string[] } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "twoFactorRedirect" in payload &&
    (payload as { twoFactorRedirect?: boolean }).twoFactorRedirect === true
  );
}
