import { redirect } from "react-router";
import { eq, and, gt } from "drizzle-orm";
import { auth } from "@/server/auth-instance";
import { adminDb } from "@/server/admin-db";
import { authSession, authUser } from "@/db/auth-schema";
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

export async function getSession(request: Request): Promise<SessionResult> {
  const result = (await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  })) as {
    response?: {
      session?: { token: string; expiresAt: Date | string | number; userId: string };
      user?: { id: string; email?: string | null; name?: string | null };
    };
    headers?: Headers;
  };
  const headers = mergeBetterAuthSetCookieHeaders(result?.headers);
  const payload = result?.response;
  const session = payload?.session;
  const user = payload?.user;

  if (!session || !user) {
    return { session: null, user: null, headers };
  }

  return {
    session: {
      token: session.token,
      expiresAt: new Date(session.expiresAt),
      userId: session.userId,
    },
    user: {
      id: user.id,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
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

export async function resolveBearerSessionUser(
  accessToken: string,
): Promise<AuthUser | null> {
  const now = new Date();
  const [row] = await adminDb
    .select({
      userId: authSession.userId,
      email: authUser.email,
      name: authUser.name,
    })
    .from(authSession)
    .innerJoin(authUser, eq(authSession.userId, authUser.id))
    .where(and(eq(authSession.token, accessToken), gt(authSession.expiresAt, now)))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.userId,
    email: row.email ?? undefined,
    name: row.name ?? undefined,
  };
}
