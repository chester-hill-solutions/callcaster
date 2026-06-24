import type { EmailOtpType, Session, User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acceptWorkspaceInvitations,
  createNewWorkspace,
  getInvitesByUserId,
} from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { Database } from "@/lib/database.types";
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
  | { ok: true; session: Session; user: User }
  | { ok: false; error: string };

/** Shared email/password login used by HTML sign-in and JSON token API. */
export async function loginWithPassword(
  supabaseClient: SupabaseClient<Database>,
  email: string,
  password: string,
): Promise<PasswordLoginResult> {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session || !data.user) {
    return {
      ok: false,
      error: error?.message ?? "Invalid credentials",
    };
  }

  return { ok: true, session: data.session, user: data.user };
}

function mapUserProfile(user: User): AuthTokensResponse["user"] {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email,
    first_name:
      typeof meta.first_name === "string" ? meta.first_name : null,
    last_name: typeof meta.last_name === "string" ? meta.last_name : null,
  };
}

function mapSessionResponse(session: Session, user: User): AuthTokensResponse {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
    token_type: "bearer",
    user: mapUserProfile(user),
  };
}

export async function registerUser(
  request: Request,
  body: RegisterBody,
): Promise<
  | { ok: true; data: AuthTokensResponse | { user: AuthTokensResponse["user"]; message: string } }
  | { ok: false; error: string; status: number }
> {
  const { supabaseClient } = createSupabaseServerClient(request);

  const { data, error } = await supabaseClient.auth.signUp({
    email: body.email,
    password: body.password,
    options: {
      data: {
        first_name: body.first_name ?? "",
        last_name: body.last_name ?? "",
      },
    },
  });

  if (error) {
    logger.error("registerUser failed", error);
    return { ok: false, error: error.message, status: 400 };
  }

  if (data.session && data.user) {
    return { ok: true, data: mapSessionResponse(data.session, data.user) };
  }

  if (data.user) {
    return {
      ok: true,
      data: {
        user: mapUserProfile(data.user),
        message: "Registration successful. Verify your email before signing in.",
      },
    };
  }

  return { ok: false, error: "Registration failed", status: 500 };
}

export async function tokenLogin(
  request: Request,
  body: TokenBody,
): Promise<
  | { ok: true; data: AuthTokensResponse }
  | { ok: false; error: string; status: number }
> {
  const { supabaseClient } = createSupabaseServerClient(request);
  const login = await loginWithPassword(supabaseClient, body.email, body.password);

  if (!login.ok) {
    return { ok: false, error: login.error, status: 401 };
  }

  return {
    ok: true,
    data: mapSessionResponse(login.session, login.user),
  };
}

export async function refreshTokens(
  request: Request,
  body: RefreshBody,
): Promise<
  | { ok: true; data: AuthTokensResponse }
  | { ok: false; error: string; status: number }
> {
  const { supabaseClient } = createSupabaseServerClient(request);

  const { data, error } = await supabaseClient.auth.refreshSession({
    refresh_token: body.refresh_token,
  });

  if (error || !data.session || !data.user) {
    return {
      ok: false,
      error: error?.message ?? "Invalid refresh token",
      status: 401,
    };
  }

  return { ok: true, data: mapSessionResponse(data.session, data.user) };
}

export async function signOutUser(request: Request): Promise<void> {
  const { supabaseClient } = createSupabaseServerClient(request);
  await supabaseClient.auth.signOut();
}

export async function forgotPassword(
  request: Request,
  body: ForgotPasswordBody,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { supabaseClient } = createSupabaseServerClient(request);
  const origin = new URL(request.url).origin;

  const { error } = await supabaseClient.auth.resetPasswordForEmail(body.email, {
    redirectTo: `${origin}/api/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  return { ok: true };
}

export async function resetPassword(
  supabaseClient: SupabaseClient<Database>,
  body: ResetPasswordBody,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (body.password !== body.confirm_password) {
    return { ok: false, error: "Passwords do not match", status: 400 };
  }

  const { error } = await supabaseClient.auth.updateUser({
    password: body.password,
  });

  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  return { ok: true };
}

export async function verifyEmailOtp(
  request: Request,
  body: VerifyEmailBody,
): Promise<
  | { ok: true; data: AuthTokensResponse }
  | { ok: false; error: string; status: number }
> {
  const { supabaseClient } = createSupabaseServerClient(request);

  const { data, error } = await supabaseClient.auth.verifyOtp({
    type: body.type as EmailOtpType,
    token_hash: body.token_hash,
  });

  if (error || !data.session || !data.user) {
    return {
      ok: false,
      error: error?.message ?? "Verification failed",
      status: 400,
    };
  }

  return { ok: true, data: mapSessionResponse(data.session, data.user) };
}

export async function getMeProfile(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
) {
  const { data: workspaces, error: workspacesError } = await supabaseClient
    .from("workspace_users")
    .select("last_accessed, role, workspace(id, name)")
    .eq("user_id", userId)
    .order("last_accessed", { ascending: false });

  if (workspacesError) {
    logger.error("getMeProfile workspaces error", workspacesError);
  }

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  return {
    user: user ? mapUserProfile(user) : { id: userId },
    workspaces: workspaces ?? [],
    last_accessed_workspace_id: workspaces?.[0]?.workspace
      ? (workspaces[0].workspace as { id: string }).id
      : null,
  };
}

export async function updateMeProfile(
  supabaseClient: SupabaseClient<Database>,
  body: UpdateMeBody,
): Promise<
  | { ok: true; data: AuthTokensResponse["user"] }
  | { ok: false; error: string; status: number }
> {
  const updatePayload: {
    email?: string;
    password?: string;
    data?: Record<string, string>;
  } = {};

  if (body.email) updatePayload.email = body.email;
  if (body.password) updatePayload.password = body.password;
  if (body.first_name || body.last_name) {
    updatePayload.data = {
      ...(body.first_name ? { first_name: body.first_name } : {}),
      ...(body.last_name ? { last_name: body.last_name } : {}),
    };
  }

  const { data, error } = await supabaseClient.auth.updateUser(updatePayload);

  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Update failed", status: 400 };
  }

  return { ok: true, data: mapUserProfile(data.user) };
}

export async function listPendingInvites(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
) {
  const invites = await getInvitesByUserId(supabaseClient, userId);
  return { invites: invites ?? [] };
}

export async function acceptInvites(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  body: AcceptInvitesBody,
) {
  const result = await acceptWorkspaceInvitations(
    supabaseClient,
    body.invitation_ids,
    userId,
  );
  const errors = result?.errors ?? [];
  if (errors.length > 0) {
    return { ok: false as const, errors, status: 400 };
  }
  return { ok: true as const, accepted: body.invitation_ids.length };
}

export async function createWorkspaceForUser(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  name: string,
) {
  return createNewWorkspace({
    supabaseClient,
    workspaceName: name,
    user_id: userId,
  });
}
