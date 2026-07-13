import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import { jsonError } from "@/lib/platform-api.server";
import { adminDb } from "@/server/admin-db";
import { authUser } from "@/db/auth-schema";
import { user as platformUser, workspace_users } from "@/db/schema";

/** Workspace roles that must enroll in TOTP 2FA (owner/admin/field_director per security baseline). */
export const PRIVILEGED_WORKSPACE_ROLES = ["owner", "admin", "field_director"] as const;

export type PrivilegedWorkspaceRole = (typeof PRIVILEGED_WORKSPACE_ROLES)[number];

export function isPrivilegedWorkspaceRole(
  role: string,
): role is PrivilegedWorkspaceRole {
  return PRIVILEGED_WORKSPACE_ROLES.includes(role as PrivilegedWorkspaceRole);
}

function isTwoFactorEnrollmentExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith("/two-factor") ||
    pathname.startsWith("/account/security") ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/signout") ||
    pathname.startsWith("/api/auth")
  );
}

async function privilegedUserNeedsTwoFactorEnrollment(
  userId: string,
  isPrivileged?: boolean,
): Promise<boolean> {
  const privileged =
    isPrivileged ?? (await userHasPrivilegedWorkspaceRole(userId));
  if (!privileged) {
    return false;
  }
  return !(await isTwoFactorEnabled(userId));
}

export async function userHasPrivilegedWorkspaceRole(userId: string): Promise<boolean> {
  const memberships = await adminDb
    .select({ role: workspace_users.role })
    .from(workspace_users)
    .where(eq(workspace_users.user_id, userId));

  return memberships.some((m) =>
    PRIVILEGED_WORKSPACE_ROLES.includes(m.role as PrivilegedWorkspaceRole),
  );
}

/**
 * Single source of truth for "this user is required to keep 2FA": a platform
 * sudo admin OR a privileged workspace role. Used both to FORCE enrollment
 * (admin/workspace middleware) and to FORBID disabling — the two must agree, or
 * a sudo-only account could disable the 2FA the admin panel then re-mandates.
 */
export async function userIsTwoFactorProtected(userId: string): Promise<boolean> {
  const [account] = await adminDb
    .select({ accessLevel: platformUser.access_level })
    .from(platformUser)
    .where(eq(platformUser.id, userId))
    .limit(1);
  if (account?.accessLevel === "sudo") return true;
  return userHasPrivilegedWorkspaceRole(userId);
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
 * JSON API guard: block privileged session users who have not enrolled in 2FA.
 * API-key callers (no userId) are not subject to this gate.
 */
export async function blockUnenrolledPrivilegedSessionUser(args: {
  userId: string | null;
  request: Request;
  isPrivileged?: boolean;
}): Promise<Response | null> {
  if (!args.userId) {
    return null;
  }

  if (process.env.E2E_DISABLE_2FA_ENFORCEMENT === "1") {
    if (process.env.NODE_ENV !== "production" || process.env.E2E_TEST === "1") {
      return null;
    }
    console.error(
      "E2E_DISABLE_2FA_ENFORCEMENT=1 is set in production — ignoring; 2FA enforcement remains active.",
    );
  }

  const pathname = new URL(args.request.url).pathname;
  if (isTwoFactorEnrollmentExemptPath(pathname)) {
    return null;
  }

  if (!(await privilegedUserNeedsTwoFactorEnrollment(args.userId, args.isPrivileged))) {
    return null;
  }

  return jsonError(
    "Two-factor authentication enrollment is required for owner and admin accounts.",
    403,
    "mfa_enrollment_required",
  );
}

/**
 * Require a user to have 2FA enabled before receiving a privileged workspace role.
 */
export async function requireTwoFactorForPrivilegedRoleAssignment(
  targetUserId: string,
  role: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!isPrivilegedWorkspaceRole(role)) {
    return { ok: true };
  }

  const enrolled = await isTwoFactorEnabled(targetUserId);
  if (!enrolled) {
    return {
      ok: false,
      error:
        "The user must enroll in two-factor authentication before receiving an owner or admin role.",
      status: 403,
    };
  }

  return { ok: true };
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
  if (isTwoFactorEnrollmentExemptPath(pathname)) {
    return;
  }

  if (!(await privilegedUserNeedsTwoFactorEnrollment(args.userId, args.isPrivileged))) {
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
