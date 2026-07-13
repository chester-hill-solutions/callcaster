import { workspace_audit_event } from "@/db/schema";
import { db } from "@/server/db";

const SENSITIVE_METADATA_KEY = /password|secret|token|authorization|body|credential/i;
const MAX_METADATA_STRING_LENGTH = 500;

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
