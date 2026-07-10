import { data, redirect, type LoaderFunctionArgs } from "react-router";
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
 * CHS `@chester-hill-solutions/auth-react-router` compatible layout loader factory.
 * Thin adapter over Better Auth until the package is installed from GitHub Packages.
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
 * CHS `@chester-hill-solutions/auth-react-router` compatible session user guard.
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
