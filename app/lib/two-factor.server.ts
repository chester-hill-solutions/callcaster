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
  /**
   * Caller-supplied privilege override. Sudo admins are privileged regardless of
   * workspace role, but that fact is known to the admin-layout middleware (via
   * access_level) — pass `true` there to avoid an extra workspace-role lookup on
   * the workspace hot path and to gate sudo accounts that hold no privileged
   * workspace membership.
   */
  isPrivileged?: boolean;
}): Promise<void> {
  // Test-only escape hatch. Never honored in real production: a leaked env var
  // must not silently disable a security control (mirrors
  // TWILIO_VALIDATE_WEBHOOKS). The E2E harness runs with NODE_ENV=production
  // and sets E2E_TEST=1 explicitly.
  if (process.env.E2E_DISABLE_2FA_ENFORCEMENT === "1") {
    if (process.env.NODE_ENV !== "production" || process.env.E2E_TEST === "1") {
      return;
    }
    console.error(
      "E2E_DISABLE_2FA_ENFORCEMENT=1 is set in production — ignoring; 2FA enforcement remains active.",
    );
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

  const privileged =
    args.isPrivileged || (await userHasPrivilegedWorkspaceRole(args.userId));
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
