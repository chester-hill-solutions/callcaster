import { and, eq } from "drizzle-orm";
import { inbound_queue, script, workspace_number } from "@/db/schema";
import type { TenantDb } from "@/server/tenant-db";
import {
  buildInboundRoutingPresetPatch,
  type InboundRoutingPresetApplication,
} from "../../shared/inbound-routing-presets";

type RoutingTenantDb = Pick<
  TenantDb,
  "inbound_queue" | "script" | "workspace_number"
>;

type RoutingPresetWriteResult =
  | { ok: true; number: Awaited<ReturnType<RoutingTenantDb["workspace_number"]["update"]>>[number] }
  | { ok: false; error: string; status: 400 | 404 };

function isVerifiedCallerIdCapabilities(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "verification_status" in value &&
      value.verification_status === "success",
  );
}

export async function applyRoutingPresetWithTenantDb(
  tdb: RoutingTenantDb,
  numberId: string,
  application: InboundRoutingPresetApplication,
): Promise<RoutingPresetWriteResult> {
  let patch;
  try {
    patch = buildInboundRoutingPresetPatch(application);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Choose valid routing settings",
      status: 400,
    };
  }
  const parsedNumberId = Number(numberId);
  if (!Number.isInteger(parsedNumberId) || parsedNumberId <= 0) {
    return {
      ok: false,
      error: "Choose a valid phone number",
      status: 400,
    };
  }

  switch (application.presetId) {
    case "queue": {
      const queue = await tdb.inbound_queue.findFirst({
        columns: { id: true },
        where: eq(inbound_queue.id, application.queueId),
      });
      if (!queue) {
        return {
          ok: false,
          error: "Choose a queue in this workspace",
          status: 400,
        };
      }
      break;
    }
    case "automated_menu": {
      const selectedScript = await tdb.script.findFirst({
        columns: { id: true },
        where: eq(script.id, application.scriptId),
      });
      if (!selectedScript) {
        return {
          ok: false,
          error: "Choose an automated menu in this workspace",
          status: 400,
        };
      }
      break;
    }
    case "forward": {
      const forwardingNumber = await tdb.workspace_number.findFirst({
        columns: { capabilities: true, id: true },
        where: and(
          eq(workspace_number.type, "caller_id"),
          eq(workspace_number.phone_number, application.phoneNumber),
        ),
      });
      if (
        !forwardingNumber ||
        !isVerifiedCallerIdCapabilities(forwardingNumber.capabilities)
      ) {
        return {
          ok: false,
          error: "Choose a verified caller ID in this workspace",
          status: 400,
        };
      }
      break;
    }
    case "agent":
    case "voicemail":
    case "webhook_only":
      break;
    default: {
      const exhaustiveApplication: never = application;
      return exhaustiveApplication;
    }
  }

  const rows = await tdb.workspace_number.update({
    set: patch,
    where: eq(workspace_number.id, parsedNumberId),
  });
  const number = rows[0];
  if (!number) {
    return {
      ok: false,
      error: "Phone number not found",
      status: 404,
    };
  }
  return { ok: true, number };
}
