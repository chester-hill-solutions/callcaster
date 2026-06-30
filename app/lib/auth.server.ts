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
  const result = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });

  const headers = mergeBetterAuthSetCookieHeaders(result?.headers);
  const payload = result?.response ?? result;

  if (!payload?.session || !payload?.user) {
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
