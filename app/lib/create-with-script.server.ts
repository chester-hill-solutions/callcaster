import { and, eq } from "drizzle-orm";
import { canSpendFromNumber } from "@/lib/number-rental-lifecycle";
import { script as scriptTable } from "@/db/schema";
import type { Json , Database } from "@/lib/db-types";
import type { CampaignType } from "@/lib/database/campaign.server";
import { logger } from "@/lib/logger.server";
import {
  findCampaignAudienceLink,
  insertCampaignAudienceLink,
  listContactIdsForAudience,
} from "@/lib/campaign-audience-db.server";
import { getCampaignQueueContactIds } from "@/lib/campaign-queue-db.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { createTenantDb } from "@/server/tenant-db";

const SCRIPT_TYPES_FOR_CAMPAIGN: Record<CampaignType, string> = {
  live_call: "script",
  message: "script",
  robocall: "ivr",
  simple_ivr: "ivr",
  complex_ivr: "ivr",
};

export type CreateWithScriptPreflightResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export async function validateCreateWithScriptPreflight(args: {
  workspaceId: string;
  callerId: string;
  audienceIds: number[];
  existingScriptId?: number | null;
}): Promise<CreateWithScriptPreflightResult> {
  const tdb = createTenantDb(args.workspaceId);

  try {
    const workspaceNumbers = await tdb.workspace_number.findMany({
      columns: { phone_number: true, suspended_at: true },
    });
    const ownsNumber = workspaceNumbers.some((row) => row.phone_number === args.callerId);
    // A number suspended for an unpaid rental stays owned and keeps receiving
    // calls, but must not be used to spend — otherwise "suspended" means
    // nothing and the unpaid balance keeps growing.
    const validNumbers = workspaceNumbers
      .filter((row) => canSpendFromNumber(row))
      .map((row) => row.phone_number)
      .filter((phone): phone is string => Boolean(phone));

    if (!validNumbers.includes(args.callerId)) {
      return {
        ok: false,
        error: ownsNumber
          ? "caller_id is suspended for an unpaid rental — add credits to restore it"
          : "caller_id must be a phone number that belongs to this workspace",
        status: 400,
      };
    }

    if (args.audienceIds.length > 0) {
      const workspaceAudiences = await tdb.audience.findMany({
        columns: { id: true },
      });
      const validAudienceIds = new Set(workspaceAudiences.map((row) => row.id));
      const invalid = args.audienceIds.filter((id) => !validAudienceIds.has(id));
      if (invalid.length > 0) {
        return {
          ok: false,
          error: `audience_ids must belong to this workspace; invalid: ${invalid.join(", ")}`,
          status: 400,
        };
      }
    }

    if (args.existingScriptId != null) {
      const existingScript = await tdb.script.findFirst({
        where: eq(scriptTable.id, args.existingScriptId),
        columns: { id: true },
      });
      if (!existingScript) {
        return {
          ok: false,
          error: "script_id must belong to this workspace",
          status: 400,
        };
      }
    }

    return { ok: true };
  } catch (error) {
    logger.error("validateCreateWithScriptPreflight error", error);
    return { ok: false, error: "Failed to validate request", status: 500 };
  }
}

export async function createScriptForCampaign(args: {
  workspaceId: string;
  campaignType: CampaignType;
  scriptPayload?: {
    name?: string;
    type?: string;
    steps?: unknown;
  } | null;
  existingScriptId?: number | null;
  createdBy: string | null;
}): Promise<
  | {
      ok: true;
      scriptId: number;
      createdScript: {
        id: number;
        name: string;
        type: string | null;
        steps: unknown;
      } | null;
    }
  | { ok: false; error: string; status: number }
> {
  if (args.scriptPayload) {
    const tdb = createTenantDb(args.workspaceId);
    const scriptType =
      args.scriptPayload.type ??
      SCRIPT_TYPES_FOR_CAMPAIGN[args.campaignType as keyof typeof SCRIPT_TYPES_FOR_CAMPAIGN];
    const steps = args.scriptPayload.steps ?? { pages: {}, blocks: {} };

    try {
      const rows = await tdb.script.insert({
        name: args.scriptPayload.name ?? "Campaign script",
        type: scriptType,
        steps: steps as Json,
        created_by: args.createdBy,
      });
      const scriptRow = rows[0];
      if (!scriptRow) {
        return { ok: false, error: "Failed to create script", status: 500 };
      }

      return {
        ok: true,
        scriptId: scriptRow.id,
        createdScript: {
          id: scriptRow.id,
          name: scriptRow.name,
          type: scriptRow.type,
          steps: scriptRow.steps,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create script";
      logger.error("createScriptForCampaign error", error);
      return { ok: false, error: `Failed to create script: ${message}`, status: 500 };
    }
  }

  if (args.existingScriptId == null) {
    return { ok: false, error: "script or script_id is required", status: 400 };
  }

  return {
    ok: true,
    scriptId: args.existingScriptId,
    createdScript: null,
  };
}

export async function linkAudiencesToNewCampaign(args: {
  campaignId: number;
  audienceIds: number[];
  enqueueAudienceContacts: boolean;
}): Promise<{ audiencesLinked: number; contactsEnqueued: number }> {
  let audiencesLinked = 0;
  let contactsEnqueued = 0;
  let queuedContactIds = new Set<number>();

  if (args.enqueueAudienceContacts && args.audienceIds.length > 0) {
    queuedContactIds = new Set(await getCampaignQueueContactIds(args.campaignId));
  }

  for (const audienceId of args.audienceIds) {
    try {
      const existing = await findCampaignAudienceLink(args.campaignId, audienceId);
      if (existing) {
        continue;
      }

      await insertCampaignAudienceLink(args.campaignId, audienceId);
      audiencesLinked += 1;

      if (!args.enqueueAudienceContacts) {
        continue;
      }

      const audienceContactIds = await listContactIdsForAudience(audienceId);
      const contactIdsToEnqueue = audienceContactIds.filter(
        (contactId) => !queuedContactIds.has(contactId),
      );

      if (contactIdsToEnqueue.length === 0) {
        continue;
      }

      await enqueueContactsForCampaign(
        args.campaignId,
        contactIdsToEnqueue,
        { requeue: false },
      );
      contactsEnqueued += contactIdsToEnqueue.length;
      contactIdsToEnqueue.forEach((id) => queuedContactIds.add(id));
    } catch (error) {
      logger.error("linkAudiencesToNewCampaign error", error);
    }
  }

  return { audiencesLinked, contactsEnqueued };
}
