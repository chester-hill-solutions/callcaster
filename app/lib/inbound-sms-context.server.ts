import { data as routeData } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { findPotentialContacts } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber } from "@/lib/utils";

export type InboundWorkspaceContext = {
  workspace: string;
  twilio_data: { sid: string; authToken: string } | null;
  webhook: Array<{ events?: Array<{ category: string }> }>;
};

export function parseTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInboundToNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return normalizePhoneNumber(trimmed);
  } catch {
    return trimmed;
  }
}

async function lookupWorkspaceNumberByPhone(
  supabase: SupabaseClient<Database>,
  phone: string,
): Promise<
  | { ok: true; ctx: InboundWorkspaceContext }
  | { ok: false; error: unknown }
  | { ok: false; notFound: true }
> {
  if (!phone) {
    return { ok: false, notFound: true };
  }

  const { data, error } = await supabase
    .from("workspace_number")
    .select(
      `
        workspace,
        ...workspace!inner(twilio_data, webhook(*))`,
    )
    .eq("phone_number", phone)
    .maybeSingle();

  if (error) {
    return { ok: false, error };
  }

  if (!data) {
    return { ok: false, notFound: true };
  }

  return { ok: true, ctx: data as unknown as InboundWorkspaceContext };
}

export async function findMatchingContactIds(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  phoneNumber: string,
): Promise<number[]> {
  const { data: contacts, error } = await findPotentialContacts(
    supabase,
    phoneNumber,
    workspaceId,
  );

  if (error) {
    logger.error("Contact lookup error:", error);
    return [];
  }

  return Array.from(
    new Set(
      (contacts ?? [])
        .map((contact) => contact?.id)
        .filter((contactId): contactId is number => typeof contactId === "number"),
    ),
  );
}

export async function resolveInboundWorkspaceContext(
  supabase: SupabaseClient<Database>,
  args: { toRaw: string; messagingServiceSid: string },
): Promise<
  | { ok: true; ctx: InboundWorkspaceContext; attributionPath: string }
  | { ok: false; response: ReturnType<typeof routeData> }
> {
  const normalizedTo = normalizeInboundToNumber(args.toRaw);
  const rawTrimmed = args.toRaw.trim();

  for (const candidate of new Set(
    [normalizedTo, rawTrimmed].filter((value) => Boolean(value)),
  )) {
    const result = await lookupWorkspaceNumberByPhone(supabase, candidate);
    if (result.ok) {
      return {
        ok: true,
        ctx: result.ctx,
        attributionPath:
          candidate === normalizedTo ? "matched_by_to_number" : "matched_by_to_number_raw",
      };
    }
    if ("error" in result && result.error) {
      logger.error("Inbound SMS workspace_number lookup error", {
        message:
          result.error &&
          typeof result.error === "object" &&
          "message" in result.error
            ? String((result.error as { message?: string }).message)
            : String(result.error),
        code:
          result.error &&
          typeof result.error === "object" &&
          "code" in result.error
            ? (result.error as { code?: string }).code
            : undefined,
        phone: candidate,
      });
      return { ok: false, response: routeData({ error: "Number lookup failed" }, { status: 500 }) };
    }
  }

  const msSid = args.messagingServiceSid.trim();
  if (!msSid.startsWith("MG")) {
    logger.warn("Inbound SMS number not found and no Messaging Service SID to fall back on", {
      toRaw: args.toRaw,
      normalizedTo,
    });
    return { ok: false, response: routeData({ error: "Number not found" }, { status: 404 }) };
  }

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspace")
    .select("id, twilio_data, webhook(*)")
    .or(
      `twilio_data->portalConfig->>messagingServiceSid.eq.${msSid},twilio_data->onboarding->messagingService->>serviceSid.eq.${msSid}`,
    );

  if (workspaceError) {
    logger.error("Inbound SMS workspace lookup by Messaging Service SID failed", workspaceError);
    return {
      ok: false,
      response: routeData({ error: "Messaging service lookup failed" }, { status: 500 }),
    };
  }

  if (!workspaces?.length) {
    logger.warn(
      "Inbound SMS number not found; Messaging Service SID did not match any workspace",
      {
        messagingServiceSid: msSid,
        toRaw: args.toRaw,
        normalizedTo,
      },
    );
    return { ok: false, response: routeData({ error: "Number not found" }, { status: 404 }) };
  }

  if (workspaces.length > 1) {
    logger.error("Inbound SMS Messaging Service SID matched multiple workspaces", {
      messagingServiceSid: msSid,
      workspaceCount: workspaces.length,
    });
    return {
      ok: false,
      response: routeData(
        { error: "Messaging service matches multiple workspaces" },
        { status: 409 },
      ),
    };
  }

  const row = workspaces[0] as {
    id: string;
    twilio_data: InboundWorkspaceContext["twilio_data"];
    webhook?: InboundWorkspaceContext["webhook"];
  };

  return {
    ok: true,
    ctx: {
      workspace: row.id,
      twilio_data: row.twilio_data,
      webhook: row.webhook ?? [],
    },
    attributionPath: "matched_by_messaging_service_sid",
  };
}
