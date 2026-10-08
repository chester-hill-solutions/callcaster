import { NumberReleaseIncompleteError } from "@/lib/number-release.server";
import { purchaseNumberForWorkspace } from "@/lib/number-purchase.server";
import {
  createWorkspaceTwilioInstance,
  getUserRole,
  getWorkspacePhoneNumbers,
  removeWorkspacePhoneNumber,
  requireWorkspaceAccess,
  updateCallerId,
  updateWorkspacePhoneNumber,
} from "@/lib/database/workspace.server";
import type { Database } from "@/lib/db-types";
import { startWorkspaceCallerIdVerification } from "@/lib/caller-id-verification.server";
import { logger } from "@/lib/logger.server";
import { MemberRole } from "@/lib/member-role";
import { normalizeInboundRingCount } from "../../shared/inbound-rings";
import type { patchNumberBodySchema } from "@/lib/schemas/api/platform-workspace-admin";
import type { z } from "zod";
import type { InboundRoutingPresetApplication } from "../../shared/inbound-routing-presets";
import { applyRoutingPresetWithTenantDb } from "@/lib/routing-preset-write.server";
import { AppError } from "@/lib/errors.server";
import { validateInboundScriptAttachment, withInboundScriptWrite } from "@/server/inbound-script-write.server";
import { createTenantDb } from "@/server/tenant-db";

type PatchNumberInput = z.infer<typeof patchNumberBodySchema>;

async function requireNumbersManager(
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const userRole = await getUserRole({
    user: { id: userId },
    workspaceId,
  });

  if (!userRole || userRole.role === MemberRole.Caller) {
    return {
      ok: false,
      error: "You do not have permission to manage phone numbers",
      status: 403,
    };
  }

  return { ok: true };
}

export async function listWorkspaceNumbers(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const { data, error } = await getWorkspacePhoneNumbers({
    workspaceId,
  });

  if (error) {
    logger.error("listWorkspaceNumbers error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, numbers: data ?? [] };
}

export async function purchaseWorkspaceNumber(userId: string, workspaceId: string, phoneNumber: string) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) return access;
  return purchaseNumberForWorkspace(userId, workspaceId, phoneNumber);
}

export async function patchWorkspaceNumber(
  userId: string,
  workspaceId: string,
  numberId: string,
  input: PatchNumberInput,
) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  const updates: Record<string, unknown> = {};
  if (input.inbound_action !== undefined) {
    updates.inbound_action = input.inbound_action;
  }
  if (input.inbound_audio !== undefined) {
    updates.inbound_audio = input.inbound_audio;
  }
  if (input.inbound_ring_count !== undefined) {
    updates.inbound_ring_count = normalizeInboundRingCount(input.inbound_ring_count);
  }
  if (input.inbound_queue_id !== undefined) {
    updates.inbound_queue_id = input.inbound_queue_id;
  }
  if (input.inbound_script_id !== undefined) {
    updates.inbound_script_id = input.inbound_script_id;
  }
  if (input.handset_enabled !== undefined) {
    updates.handset_enabled = input.handset_enabled;
  }
  if (input.friendly_name !== undefined) {
    updates.friendly_name = input.friendly_name;
  }

  let result;
  const selectedScriptId = input.inbound_script_id;
  try {
    result = selectedScriptId != null
      ? await withInboundScriptWrite(workspaceId, async (tdb) => {
          await validateInboundScriptAttachment(tdb, workspaceId, selectedScriptId);
          return updateWorkspacePhoneNumber({ numberId, workspaceId, updates, tdb });
        })
      : await updateWorkspacePhoneNumber({ numberId, workspaceId, updates });
  } catch (error) {
    if (error instanceof AppError) return { ok: false as const, error: error.message, status: error.statusCode };
    throw error;
  }
  const { data: number, error } = result;

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  if (input.friendly_name !== undefined && number) {
    const callerIdResult = await updateCallerId({
      workspaceId,
      number,
      friendly_name: input.friendly_name,
    });
    if (callerIdResult?.error) {
      return {
        ok: false as const,
        error: String(callerIdResult.error),
        status: 500,
      };
    }
  }

  return { ok: true as const, number };
}

/**
 * Applies a canonical inbound routing preset in one tenant-scoped update.
 * Building the complete patch before touching the database guarantees that
 * validation failures cannot leave a partially-updated route.
 */
export async function applyWorkspaceNumberRoutingPreset(
  userId: string,
  workspaceId: string,
  numberId: string,
  application: InboundRoutingPresetApplication,
) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  try {
    return application.presetId === "automated_menu"
      ? await withInboundScriptWrite(workspaceId, (tdb) =>
          applyRoutingPresetWithTenantDb(tdb, numberId, application, workspaceId),
        )
      : await applyRoutingPresetWithTenantDb(createTenantDb(workspaceId), numberId, application, workspaceId);
  } catch (error) {
    if (error instanceof AppError) return { ok: false as const, error: error.message, status: error.statusCode };
    logger.error("applyWorkspaceNumberRoutingPreset error", error);
    return {
      ok: false as const,
      error: "Failed to apply routing preset",
      status: 500,
    };
  }
}

export async function deleteWorkspaceNumber(
  userId: string,
  workspaceId: string,
  numberId: string,
) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  const { error } = await removeWorkspacePhoneNumber({
    numberId: BigInt(numberId),
    workspaceId,
  });

  if (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove phone number";
    return {
      ok: false as const,
      error: message,
      status: error instanceof NumberReleaseIncompleteError ? 409 : 500,
    };
  }

  return { ok: true as const };
}

export async function verifyWorkspaceCallerId(
  userId: string,
  workspaceId: string,
  phoneNumber: string,
  friendlyName: string,
) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  try {
    const { validationRequest, numberRequest } =
      await startWorkspaceCallerIdVerification({
        workspaceId,
        phoneNumber,
        friendlyName,
      });

    return {
      ok: true as const,
      validationRequest,
      numberRequest,
    };
  } catch (error) {
    logger.error("verifyWorkspaceCallerId error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to verify caller ID",
      status: 500,
    };
  }
}
