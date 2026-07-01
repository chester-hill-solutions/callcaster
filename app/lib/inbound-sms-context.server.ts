import { data as routeData } from "react-router";
import { eq, or, sql } from "drizzle-orm";

import {
  webhook as webhookTable,
  workspace as workspaceTable,
  workspace_number as workspaceNumberTable,
} from "@/db/schema";
import type { Database } from "@/lib/db-types";
import { findPotentialContacts } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { adminDb } from "@/server/admin-db";

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

async function loadWebhooksForWorkspace(workspaceId: string) {
  return adminDb
    .select()
    .from(webhookTable)
    .where(eq(webhookTable.workspace, workspaceId));
}

async function lookupWorkspaceNumberByPhone(phone: string): Promise<
  | { ok: true; ctx: InboundWorkspaceContext }
  | { ok: false; error: unknown }
  | { ok: false; notFound: true }
> {
  if (!phone) {
    return { ok: false, notFound: true };
  }

  try {
    const [row] = await adminDb
      .select({
        workspaceId: workspaceNumberTable.workspace,
        twilioData: workspaceTable.twilio_data,
      })
      .from(workspaceNumberTable)
      .innerJoin(workspaceTable, eq(workspaceNumberTable.workspace, workspaceTable.id))
      .where(eq(workspaceNumberTable.phone_number, phone))
      .limit(1);

    if (!row?.workspaceId) {
      return { ok: false, notFound: true };
    }

    const webhooks = await loadWebhooksForWorkspace(row.workspaceId);

    return {
      ok: true,
      ctx: {
        workspace: row.workspaceId,
        twilio_data: (
          typeof row.twilioData === "string"
            ? JSON.parse(row.twilioData)
            : row.twilioData
        ) as InboundWorkspaceContext["twilio_data"],
        webhook: webhooks as InboundWorkspaceContext["webhook"],
      },
    };
  } catch (error) {
    return { ok: false, error };
  }
}

async function findWorkspacesByMessagingServiceSid(msSid: string) {
  return adminDb
    .select({
      id: workspaceTable.id,
      twilio_data: workspaceTable.twilio_data,
    })
    .from(workspaceTable)
    .where(
      or(
        sql`${workspaceTable.twilio_data}->'portalConfig'->>'messagingServiceSid' = ${msSid}`,
        sql`${workspaceTable.twilio_data}->'onboarding'->'messagingService'->>'serviceSid' = ${msSid}`,
      ),
    );
}

export async function findMatchingContactIds(workspaceId: string,
  phoneNumber: string,
): Promise<number[]> {
  const { data: contacts, error } = await findPotentialContacts(
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
    const result = await lookupWorkspaceNumberByPhone(candidate);
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

  try {
    const workspaces = await findWorkspacesByMessagingServiceSid(msSid);

    if (!workspaces.length) {
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

    const row = workspaces[0]!;
    const webhooks = await loadWebhooksForWorkspace(row.id);

    return {
      ok: true,
      ctx: {
        workspace: row.id,
        twilio_data: (
          typeof row.twilio_data === "string"
            ? JSON.parse(row.twilio_data)
            : row.twilio_data
        ) as InboundWorkspaceContext["twilio_data"],
        webhook: webhooks as InboundWorkspaceContext["webhook"],
      },
      attributionPath: "matched_by_messaging_service_sid",
    };
  } catch (workspaceError) {
    logger.error("Inbound SMS workspace lookup by Messaging Service SID failed", workspaceError);
    return {
      ok: false,
      response: routeData({ error: "Messaging service lookup failed" }, { status: 500 }),
    };
  }
}
