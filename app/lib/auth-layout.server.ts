import { data, redirect, type LoaderFunctionArgs } from "react-router";
import {
  createRequireCapability,
  createInviteCompletionLoader,
} from "@chester-hill-solutions/auth-react-router";
import { getSession, type AuthUser } from "@/lib/auth.server";

export type AuthLayoutLoaderData = {
  userId: string;
  user: AuthUser;
};

export type CreateAuthLayoutLoaderOptions = {
  signInPath?: string;
  onAuthenticated?: (args: {
    request: Request;
    user: AuthUser;
    headers: Headers;
  }) => Promise<Response | null> | Response | null;
};

/**
 * CallCaster auth layout loader. Package `createAuthLayoutLoader` expects a
 * different SessionReader / continue-URL shape and omits `userId` in the
 * payload, so we keep this thin Better Auth shim and re-export capability
 * helpers from `@chester-hill-solutions/auth-react-router` below.
 */
export function createAuthLayoutLoader(
  options: CreateAuthLayoutLoaderOptions = {},
) {
  const signInPath = options.signInPath ?? "/signin";

  return async function authLayoutLoader({ request, url }: LoaderFunctionArgs) {
    const { user, headers } = await getSession(request);
    if (!user) {
      const next = `${url.pathname}${url.search}`;
      throw redirect(`${signInPath}?next=${encodeURIComponent(next)}`);
    }

    if (options.onAuthenticated) {
      const early = await options.onAuthenticated({ request, user, headers });
      if (early) {
        return early;
      }
    }

    return data({ userId: user.id, user } satisfies AuthLayoutLoaderData, {
      headers,
    });
  };
}

/**
 * CallCaster session user guard. Package export takes a SessionReader options
 * object; this shim matches existing CallCaster call sites.
 */
export function createRequireSessionUserId(signInPath = "/signin") {
  return async function requireSessionUserId(request: Request): Promise<string> {
    const { user } = await getSession(request);
    if (!user) {
      throw redirect(signInPath);
    }
    return user.id;
  };
}

export { createRequireCapability, createInviteCompletionLoader };
