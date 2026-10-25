import { redirect } from "react-router";
import { eq, and, gt } from "drizzle-orm";
import { auth } from "@/server/auth-instance";
import { adminDb } from "@/server/admin-db";
import { authSession, authUser } from "@/db/auth-schema";
import { user as platformUser } from "@/db/schema";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";

export type AuthUser = {
  id: string;
  email?: string;
  name?: string;
};

export type SessionResult = {
  session: { token: string; expiresAt: Date; userId: string } | null;
  user: AuthUser | null;
  headers: Headers;
};

/**
 * A platform administrator can disable an account, and `user.access_level` is
 * the only marker. It must mean "no authority": a disabled account may not keep
 * using a live session and may not obtain a working one again, so both session
 * resolution paths below treat it as unauthenticated. Disabling also revokes the
 * sessions ({@link revokeAllSessionsForUser}); this is the backstop for a session
 * that outlived the revoke, or for one minted between the two writes.
 *
 * Cost: one primary-key read on `public.user` per authenticated request. The
 * alternative - denormalising the flag onto `auth_user` - needs a second writer
 * to keep in step, and a stale flag either locks out a valid account or leaves a
 * disabled one working.
 */
export async function isUserDisabled(userId: string): Promise<boolean> {
  const [row] = await adminDb
    .select({ accessLevel: platformUser.access_level })
    .from(platformUser)
    .where(eq(platformUser.id, userId))
    .limit(1);
  return row?.accessLevel === "disabled";
}

export async function getSession(request: Request): Promise<SessionResult> {
  const result = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });

  const resultAny = result as any;
  const headers = mergeBetterAuthSetCookieHeaders(resultAny?.headers);
  const payload = resultAny?.response ?? resultAny;

  if (!payload?.session || !payload?.user) {
    return { session: null, user: null, headers };
  }

  if (await isUserDisabled(payload.user.id)) {
    return { session: null, user: null, headers };
  }

  return {
    session: {
      token: payload.session.token,
      expiresAt: new Date(payload.session.expiresAt),
      userId: payload.session.userId,
    },
    user: {
      id: payload.user.id,
      email: payload.user.email ?? undefined,
      name: payload.user.name ?? undefined,
    },
    headers,
  };
}

export async function verifyAuth(request: Request, nextUrl = "/signin") {
  const { user, headers } = await getSession(request);
  if (!user) {
    throw redirect(`/signin?next=${nextUrl}`);
  }
  return { user, headers };
}

export async function requireSessionUserId(request: Request): Promise<string> {
  const { user } = await verifyAuth(request);
  return user.id;
}

export async function signOut(request: Request): Promise<Headers> {
  const result = await auth.api.signOut({
    headers: request.headers,
    returnHeaders: true,
  });
  return mergeBetterAuthSetCookieHeaders(result?.headers);
}

/** Resolve a bearer session token to a user (API clients). */
/**
 * Bearer clients hold the raw session token (see resolveBearerSessionUser);
 * Better Auth's cookie-based signOut cannot see it, so sign-out must delete
 * the row directly or the token keeps working until it expires.
 */
export async function revokeSessionByToken(token: string): Promise<void> {
  await adminDb.delete(authSession).where(eq(authSession.token, token));
}

/** Revoke every live session of a user — used when an administrator disables the account. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await adminDb.delete(authSession).where(eq(authSession.userId, userId));
}

export async function resolveBearerSessionUser(
  accessToken: string,
): Promise<AuthUser | null> {
  const now = new Date();
  const [row] = await adminDb
    .select({
      userId: authSession.userId,
      email: authUser.email,
      name: authUser.name,
      accessLevel: platformUser.access_level,
    })
    .from(authSession)
    .innerJoin(authUser, eq(authSession.userId, authUser.id))
    .leftJoin(platformUser, eq(authSession.userId, platformUser.id))
    .where(
      and(eq(authSession.token, accessToken), gt(authSession.expiresAt, now)),
    )
    .limit(1);

  // A disabled account holds no authority, bearer token or not.
  if (!row || row.accessLevel === "disabled") {
    return null;
  }

  return {
    id: row.userId,
    email: row.email ?? undefined,
    name: row.name ?? undefined,
  };
}
