import { and, desc, eq, lt, or } from "drizzle-orm";
import { workspace_audit_event } from "@/db/schema";
import { logger } from "@/lib/logger.server";
import { db } from "@/server/db";

const SENSITIVE_METADATA_KEY = /password|secret|token|authorization|body|credential/i;
const MAX_METADATA_STRING_LENGTH = 500;
const DEFAULT_AUDIT_PAGE_SIZE = 50;
const MAX_AUDIT_PAGE_SIZE = 100;

export type WorkspaceAuditActorType = "session" | "api_key" | "system" | "support";
export type WorkspaceAuditOutcome = "success" | "failure" | "denied";

export type RecordWorkspaceAuditEventInput = {
  workspaceId: string;
  actorType: WorkspaceAuditActorType;
  actorId?: string | null;
  apiKeyId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  outcome: WorkspaceAuditOutcome;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
};

export type WorkspaceAuditEventRow = typeof workspace_audit_event.$inferSelect;

export type AuditEventCursor = {
  createdAt: string;
  id: number;
};

export function redactAuditEventMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) {
    return {};
  }
  const redacted = redactAuditValue(metadata);
  if (!redacted || typeof redacted !== "object" || Array.isArray(redacted)) {
    return {};
  }
  return redacted as Record<string, unknown>;
}

function redactAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.length > MAX_METADATA_STRING_LENGTH) {
      return `${value.slice(0, MAX_METADATA_STRING_LENGTH)}…`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactAuditValue);
  }

  if (typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_METADATA_KEY.test(key)) {
        continue;
      }
      redacted[key] = redactAuditValue(child);
    }
    return redacted;
  }

  return value;
}

export async function recordWorkspaceAuditEvent(
  input: RecordWorkspaceAuditEventInput,
): Promise<void> {
  await db.insert(workspace_audit_event).values({
    workspace_id: input.workspaceId,
    created_at: new Date().toISOString(),
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    api_key_id: input.apiKeyId ?? null,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    outcome: input.outcome,
    request_id: input.requestId ?? null,
    metadata: redactAuditEventMetadata(input.metadata),
  });
}

export async function safeRecordWorkspaceAuditEvent(
  input: RecordWorkspaceAuditEventInput,
): Promise<void> {
  try {
    await recordWorkspaceAuditEvent(input);
  } catch (error) {
    logger.error("Failed to record workspace audit event", {
      action: input.action,
      workspaceId: input.workspaceId,
      outcome: input.outcome,
      error,
    });
  }
}

export function encodeAuditEventCursor(row: Pick<WorkspaceAuditEventRow, "created_at" | "id">): string {
  return Buffer.from(JSON.stringify({ t: row.created_at, i: row.id }), "utf8").toString(
    "base64url",
  );
}

export function decodeAuditEventCursor(raw: string | null): AuditEventCursor | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as { t?: string; i?: number };
    if (typeof parsed.t !== "string" || typeof parsed.i !== "number") {
      return null;
    }
    return { createdAt: parsed.t, id: parsed.i };
  } catch {
    return null;
  }
}

export function parseAuditEventPageSize(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_AUDIT_PAGE_SIZE;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_AUDIT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_AUDIT_PAGE_SIZE);
}

export async function listWorkspaceAuditEvents(args: {
  workspaceId: string;
  limit: number;
  cursor?: AuditEventCursor | null;
}): Promise<{ events: WorkspaceAuditEventRow[]; nextCursor: string | null }> {
  const conditions = [eq(workspace_audit_event.workspace_id, args.workspaceId)];
  if (args.cursor) {
    const cursorFilter = or(
      lt(workspace_audit_event.created_at, args.cursor.createdAt),
      and(
        eq(workspace_audit_event.created_at, args.cursor.createdAt),
        lt(workspace_audit_event.id, args.cursor.id),
      ),
    );
    if (!cursorFilter) {
      throw new Error(
        "drizzle or() must yield a cursor filter for audit event pagination",
      );
    }
    conditions.push(cursorFilter);
  }

  const rows = await db
    .select()
    .from(workspace_audit_event)
    .where(and(...conditions))
    .orderBy(desc(workspace_audit_event.created_at), desc(workspace_audit_event.id))
    .limit(args.limit + 1);

  const hasMore = rows.length > args.limit;
  const events = hasMore ? rows.slice(0, args.limit) : rows;
  const last = events.at(-1);

  return {
    events,
    nextCursor: hasMore && last ? encodeAuditEventCursor(last) : null,
  };
}
