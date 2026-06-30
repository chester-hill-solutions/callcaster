import { logger } from "@/lib/logger.server";
import { auth } from "@/server/auth-instance";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import {
  acceptWorkspaceInvitations,
  createNewWorkspace,
  getInvitesByUserId,
} from "@/lib/database.server";
import { listUserWorkspaceMembershipsForProfile } from "@/lib/workspace-members-db.server";
import type {
  acceptInvitesBodySchema,
  forgotPasswordBodySchema,
  registerBodySchema,
  refreshBodySchema,
  resetPasswordBodySchema,
  tokenBodySchema,
  updateMeBodySchema,
  verifyEmailBodySchema,
} from "@/lib/schemas/api/platform-auth";
import type { z } from "zod";
import { getSession } from "@/lib/auth.server";

type RegisterBody = z.infer<typeof registerBodySchema>;
type TokenBody = z.infer<typeof tokenBodySchema>;
type RefreshBody = z.infer<typeof refreshBodySchema>;
type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;
type AcceptInvitesBody = z.infer<typeof acceptInvitesBodySchema>;
type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export type AuthTokensResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "bearer";
  user: {
    id: string;
    email?: string;
    first_name?: string | null;
    last_name?: string | null;
  };
};

export type PasswordLoginResult =
  | { ok: true; token: string; user: AuthTokensResponse["user"]; headers: Headers }
  | { ok: false; error: string };

function splitName(name: string | null | undefined): {
  first_name: string | null;
  last_name: string | null;
} {
  if (!name?.trim()) {
    return { first_name: null, last_name: null };
  }
  const parts = name.trim().split(/\s+/);
  return {
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function mapUserProfile(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}): AuthTokensResponse["user"] {
  const names = splitName(user.name);
  return {
    id: user.id,
    email: user.email ?? undefined,
    first_name: names.first_name,
    last_name: names.last_name,
  };
}

function mapTokenResponse(args: {
  token: string;
  user: AuthTokensResponse["user"];
  expiresIn?: number;
}): AuthTokensResponse {
  return {
    access_token: args.token,
    refresh_token: args.token,
    expires_in: args.expiresIn ?? 3600,
    token_type: "bearer",
    user: args.user,
  };
}

/** Shared email/password login used by HTML sign-in and JSON token API. */
export async function loginWithPassword(
  request: Request,
  email: string,
  password: string,
): Promise<PasswordLoginResult> {
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      returnHeaders: true,
    });

    const body = result?.response ?? result;
    if (!body?.token || !body?.user) {
      return { ok: false, error: "Invalid credentials" };
    }

    return {
      ok: true,
      token: body.token,
      user: mapUserProfile(body.user),
      headers: mergeBetterAuthSetCookieHeaders(result?.headers),
    };
  } catch (error) {
    logger.error("loginWithPassword failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid credentials",
    };
  }
}

export async function registerUser(
  request: Request,
  body: RegisterBody,
): Promise<
  | { ok: true; data: AuthTokensResponse | { user: AuthTokensResponse["user"]; message: string }; headers?: Headers }
  | { ok: false; error: string; status: number }
> {
  const displayName = [body.first_name, body.last_name].filter(Boolean).join(" ").trim();

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: body.email,
        password: body.password,
        name: displayName || body.email,
      },
      headers: request.headers,
      returnHeaders: true,
    });

    const payload = result?.response ?? result;
    const headers = mergeBetterAuthSetCookieHeaders(result?.headers);

    if (payload?.token && payload?.user) {
      return {
        ok: true,
        headers,
        data: mapTokenResponse({
          token: payload.token,
          user: mapUserProfile(payload.user),
        }),
      };
    }

    if (payload?.user) {
      return {
        ok: true,
        headers,
        data: {
          user: mapUserProfile(payload.user),
          message: "Registration successful. Verify your email before signing in.",
        },
      };
    }

    return { ok: false, error: "Registration failed", status: 500 };
  } catch (error) {
    logger.error("registerUser failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Registration failed",
      status: 400,
    };
  }
}

export async function tokenLogin(
  request: Request,
  body: TokenBody,
): Promise<
  | { ok: true; data: AuthTokensResponse; headers: Headers }
  | { ok: false; error: string; status: number }
> {
  const login = await loginWithPassword(request, body.email, body.password);

  if (!login.ok) {
    return { ok: false, error: login.error, status: 401 };
  }

  return {
    ok: true,
    headers: login.headers,
    data: mapTokenResponse({ token: login.token, user: login.user }),
  };
}

export async function refreshTokens(
  request: Request,
  body: RefreshBody,
): Promise<
  | { ok: true; data: AuthTokensResponse }
  | { ok: false; error: string; status: number }
> {
  try {
    const result = await auth.api.refreshToken({
      body: { refreshToken: body.refresh_token },
      headers: request.headers,
    });
    const payload = result?.response ?? result;
    if (!payload?.accessToken || !payload?.user) {
      return { ok: false, error: "Invalid refresh token", status: 401 };
    }
    return {
      ok: true,
      data: mapTokenResponse({
        token: payload.accessToken,
        user: mapUserProfile(payload.user),
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid refresh token",
      status: 401,
    };
  }
}

export async function signOutUser(request: Request): Promise<void> {
  await auth.api.signOut({ headers: request.headers });
}

export async function forgotPassword(
  request: Request,
  body: ForgotPasswordBody,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const origin = new URL(request.url).origin;

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: body.email,
        redirectTo: `${origin}/reset-password`,
      },
      headers: request.headers,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request failed",
      status: 400,
    };
  }
}

export async function resetPassword(
  request: Request,
  body: ResetPasswordBody,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (body.password !== body.confirm_password) {
    return { ok: false, error: "Passwords do not match", status: 400 };
  }

  try {
    await auth.api.resetPassword({
      body: {
        newPassword: body.password,
        token: body.token ?? "",
      },
      headers: request.headers,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Reset failed",
      status: 400,
    };
  }
}

export async function verifyEmailOtp(
  request: Request,
  body: VerifyEmailBody,
): Promise<
  | { ok: true; data: AuthTokensResponse }
  | { ok: false; error: string; status: number }
> {
  try {
    const result = await auth.api.verifyEmail({
      query: { token: body.token_hash },
      headers: request.headers,
    });
    const payload = result?.response ?? result;
    if (!payload?.user) {
      return { ok: false, error: "Verification failed", status: 400 };
    }
    const session = await getSession(request);
    if (!session.session?.token) {
      return {
        ok: true,
        data: mapTokenResponse({
          token: "",
          user: mapUserProfile(payload.user),
        }),
      };
    }
    return {
      ok: true,
      data: mapTokenResponse({
        token: session.session.token,
        user: mapUserProfile(payload.user),
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Verification failed",
      status: 400,
    };
  }
}

export async function getMeProfile(userId: string) {
  const workspaces = await listUserWorkspaceMembershipsForProfile(userId);
  const session = await auth.api.getSession({ headers: new Headers() });
  const user = session?.user;

  return {
    user: user ? mapUserProfile(user) : { id: userId },
    workspaces,
    last_accessed_workspace_id: workspaces[0]?.workspace?.id ?? null,
  };
}

export async function updateMeProfile(
  request: Request,
  body: UpdateMeBody,
): Promise<
  | { ok: true; data: AuthTokensResponse["user"] }
  | { ok: false; error: string; status: number }
> {
  const updateBody: { name?: string; email?: string } = {};
  if (body.email) updateBody.email = body.email;
  if (body.first_name || body.last_name) {
    updateBody.name = [body.first_name, body.last_name].filter(Boolean).join(" ");
  }

  try {
    const result = await auth.api.updateUser({
      body: updateBody,
      headers: request.headers,
    });
    const user = result?.user;
    if (!user) {
      return { ok: false, error: "Update failed", status: 400 };
    }

    if (body.password) {
      await auth.api.changePassword({
        body: {
          newPassword: body.password,
          currentPassword: body.current_password ?? body.password,
        },
        headers: request.headers,
      });
    }

    return { ok: true, data: mapUserProfile(user) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update failed",
      status: 400,
    };
  }
}

export async function listPendingInvites(userId: string) {
  const invites = await getInvitesByUserId(userId);
  return { invites: invites ?? [] };
}

export async function acceptInvites(userId: string, body: AcceptInvitesBody) {
  const result = await acceptWorkspaceInvitations(body.invitation_ids, userId);
  const errors = result?.errors ?? [];
  if (errors.length > 0) {
    return { ok: false as const, errors, status: 400 };
  }
  return { ok: true as const, accepted: body.invitation_ids.length };
}

export async function createWorkspaceForUser(userId: string, name: string) {
  return createNewWorkspace({
    workspaceName: name,
    user_id: userId,
  });
}
