import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthSupabaseClient,
  getDualAuthSupabase,
  getDualAuthUser,
  requireDualAuth,
  requireJsonAuth,
  type VerifyApiKeyOrSessionResult,
} from "@/lib/api-auth.server";
import type { Database } from "@/lib/database.types";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { jsonError } from "@/lib/platform-api.server";
import { createSupabaseServerClient } from "@/lib/supabase.server";

type Supabase = SupabaseClient<Database>;

export async function requireDualAuthForCampaign(
  request: Request,
  campaignId: number | string | null | undefined,
): Promise<
  | {
      auth: Exclude<VerifyApiKeyOrSessionResult, { error: string; status: 401 }>;
      supabase: Supabase;
      workspaceId: string;
    }
  | Response
> {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;

  if (campaignId == null || campaignId === "") {
    return jsonError("campaign_id is required", 400);
  }

  const supabase = getDualAuthSupabase(auth);
  const { data: campaign, error } = await supabase
    .from("campaign")
    .select("workspace")
    .eq("id", Number(campaignId))
    .single();

  if (error || !campaign?.workspace) {
    return jsonError("Campaign not found", 404);
  }

  if (auth.authType === "api_key") {
    if (auth.workspaceId !== campaign.workspace) {
      return jsonError("Forbidden", 403);
    }
  } else {
    try {
      await requireWorkspaceAccess({
        supabaseClient: supabase,
        user: auth.user,
        workspaceId: campaign.workspace,
      });
    } catch {
      return jsonError("Forbidden", 403);
    }
  }

  return { auth, supabase, workspaceId: campaign.workspace };
}

export async function requireJsonAuthForOutreachAttempt(
  request: Request,
  outreachAttemptId: number,
): Promise<
  | { supabase: Supabase; user: { id: string; email?: string } }
  | Response
> {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const supabase = getAuthSupabaseClient(auth);
  const { data: attempt, error } = await supabase
    .from("outreach_attempt")
    .select("workspace")
    .eq("id", outreachAttemptId)
    .single();

  if (error || !attempt?.workspace) {
    return jsonError("Outreach attempt not found", 404);
  }

  try {
    await requireWorkspaceAccess({
      supabaseClient: supabase,
      user: auth.user,
      workspaceId: attempt.workspace,
    });
  } catch {
    return jsonError("Forbidden", 403);
  }

  return { supabase, user: auth.user };
}

export { getDualAuthSupabase, getDualAuthUser, requireDualAuth };

export async function resolveDualAuthSession(request: Request) {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) {
    throw auth;
  }
  const { headers } = createSupabaseServerClient(request);
  return {
    supabaseClient: getDualAuthSupabase(auth),
    headers,
    user: getDualAuthUser(auth) ?? undefined,
  };
}

export async function resolveJsonAuthSession(request: Request) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) {
    throw auth;
  }
  const { headers } = createSupabaseServerClient(request);
  return {
    supabaseClient: getAuthSupabaseClient(auth),
    headers,
    user: auth.user,
  };
}
