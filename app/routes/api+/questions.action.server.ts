import { createSupabaseServerClient } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import { getAuthSupabaseClient, requireJsonAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";
import type { Json } from "@/lib/database.types";

interface RequestData {
  update?: Json;
  contact_id: number;
  campaign_id: number;
  workspace: string;
  disposition: string;
  queue_id: number;
}

type TypedOutreachFields = {
  support_level?: number | null;
  volunteer_interest?: string | null;
  lawn_sign?: boolean | null;
  vote_by_mail?: boolean | null;
  issue_tags?: string[] | null;
  membership_sold?: boolean | null;
  callback_audit?: boolean | null;
};

const TYPED_FIELD_ALIASES: Record<keyof TypedOutreachFields, string[]> = {
  support_level: ["support_level", "supportlevel", "support level", "support"],
  volunteer_interest: [
    "volunteer_interest",
    "volunteerinterest",
    "volunteer interest",
    "volunteer",
  ],
  lawn_sign: ["lawn_sign", "lawnsign", "lawn sign", "lawnsigns"],
  vote_by_mail: ["vote_by_mail", "votebymail", "vote by mail", "absentee"],
  issue_tags: ["issue_tags", "issuetags", "issue tags", "issues"],
  membership_sold: [
    "membership_sold",
    "membershipsold",
    "membership sold",
    "membership",
  ],
  callback_audit: [
    "callback_audit",
    "callbackaudit",
    "callback audit",
    "callback",
  ],
};

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(v)) return true;
    if (["false", "no", "n", "0"].includes(v)) return false;
  }
  return null;
}

function asSupportLevel(value: unknown): number | null {
  if (typeof value === "number") {
    return value >= 1 && value <= 5 ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 5) return parsed;
    const lower = trimmed.toLowerCase();
    const labelMap: Record<string, number> = {
      "strong support": 1,
      "lean support": 2,
      undecided: 3,
      "lean opposition": 4,
      "strong opposition": 5,
    };
    if (labelMap[lower] !== undefined) return labelMap[lower];
  }
  return null;
}

function asStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const tags = value
      .map((v) => (typeof v === "string" ? v.trim() : String(v).trim()))
      .filter((v) => v.length > 0);
    return tags.length > 0 ? tags : null;
  }
  if (typeof value === "string") {
    const tags = value
      .split(/[,;]\s*|\s*\|\s*/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    return tags.length > 0 ? tags : null;
  }
  return null;
}

export function extractTypedOutreachFields(update: Json | undefined): TypedOutreachFields {
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    return {};
  }
  const root = update as Record<string, unknown>;
  const lookup = new Map<string, unknown>();
  const flatten = (obj: Record<string, unknown>, prefix = "") => {
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = `${prefix}${key}`.toLowerCase();
      lookup.set(lowerKey, value);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        flatten(value as Record<string, unknown>, `${prefix}${key}.`);
      }
    }
  };
  flatten(root);

  const result: TypedOutreachFields = {};
  for (const [field, aliases] of Object.entries(TYPED_FIELD_ALIASES) as Array<
    [keyof TypedOutreachFields, string[]]
  >) {
    for (const alias of aliases) {
      const value = lookup.get(alias.toLowerCase());
      if (value === undefined || value === null || value === "") continue;
      if (field === "support_level") {
        const parsed = asSupportLevel(value);
        if (parsed !== null) result.support_level = parsed;
      } else if (field === "issue_tags") {
        const parsed = asStringArray(value);
        if (parsed !== null) result.issue_tags = parsed;
      } else if (
        field === "lawn_sign" ||
        field === "vote_by_mail" ||
        field === "membership_sold" ||
        field === "callback_audit"
      ) {
        const parsed = asBoolean(value);
        if (parsed !== null) result[field] = parsed;
      } else if (field === "volunteer_interest") {
        if (typeof value === "string" && value.trim().length > 0) {
          result.volunteer_interest = value.trim();
        }
      }
    }
  }
  return result;
}

export const action = async ({ request }: ActionFunctionArgs) => {

    const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = createSupabaseServerClient(request);
  const supabase = getAuthSupabaseClient(auth);
  const user = auth.user;
    const { update, contact_id, campaign_id, workspace, disposition, queue_id }: RequestData = await safeParseJson(request);
    await requireWorkspaceAccess({ supabaseClient: supabase, user, workspaceId: workspace });
    const typedFields = extractTypedOutreachFields(update);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentOutreach, error: searchError } = await supabase
        .from('outreach_attempt')
        .select()
        .eq('contact_id', contact_id)
        .eq("campaign_id", campaign_id)
        .gte('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (searchError && searchError.code !== 'PGRST116') {
        logger.error("Error searching for recent outreach:", searchError);
        return routeData({ error: searchError }, { status: 500, headers });
    }

    let outreachAttemptId: number | null = null;

    if (recentOutreach) {
        const { data, error } = await supabase
            .from('outreach_attempt')
            .update({
                ...(update !== undefined ? { result: update as Json } : {}),
                disposition,
                user_id: user.id,
                ...typedFields,
            })
            .eq('id', recentOutreach.id)
            .select();

        if (error) {
            logger.error("Error updating outreach attempt:", error);
            return routeData({ error }, { status: 500, headers });
        }
        outreachAttemptId = data[0]?.id ?? null;
    } else {
        const { data, error } = await supabase.rpc('create_outreach_attempt', {
            con_id: contact_id,
            cam_id: campaign_id,
            queue_id,
            wks_id: workspace,
            usr_id: user.id
        });

        if (error) {
            logger.error("Error creating outreach attempt:", error);
            return routeData({ error }, { status: 500, headers });
        }
        outreachAttemptId = typeof data === 'number' ? data : Number(data);
    }
    const { data: updatedOutreach, error: updateError } = await supabase
        .from('outreach_attempt')
        .update({
            ...(update !== undefined ? { result: update as Json } : {}),
            disposition,
            ...typedFields,
        })
        .eq('id', outreachAttemptId as number)
        .select();

    if (updateError) {
        logger.error("Error updating outreach attempt:", updateError);
        return routeData({ error: updateError }, { status: 500, headers });
    }

    return routeData(updatedOutreach[0], { headers });
}
