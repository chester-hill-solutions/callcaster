import { and, eq, ne } from "drizzle-orm";
import {
  campaign as campaignTable,
  script as scriptTable,
  workspace_number as workspaceNumberTable,
} from "@/db/schema";
import type { Json } from "@/lib/db-types";
import { db, type Database } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

type ScriptRow = typeof scriptTable.$inferSelect;

export type ScriptUsage = {
  campaignCount: number;
  inboundNumberCount: number;
  totalCount: number;
};

type ScriptContent = {
  name: string;
  steps: unknown;
  type?: string | null;
};

type WorkspaceScriptSave =
  | { mode: "create"; content: ScriptContent }
  | { mode: "update"; scriptId: number; content: ScriptContent }
  | { mode: "copy"; sourceScriptId?: number; content: ScriptContent };

type PersistenceContext = {
  workspaceId: string;
  actorId: string;
  timestamp?: string;
  tdb?: TenantDb;
};

function scriptContentFields(content: ScriptContent) {
  return {
    name: content.name,
    steps: content.steps as Json,
    ...(content.type === undefined ? {} : { type: content.type }),
  };
}

function copiedScriptName(name: string): string {
  return `${name} (Copy)`;
}

async function insertScript(
  tdb: TenantDb,
  content: ScriptContent,
  actorId: string,
  timestamp: string,
): Promise<ScriptRow> {
  const [inserted] = await tdb.script.insert({
    ...scriptContentFields(content),
    created_by: actorId,
    created_at: timestamp,
    updated_by: actorId,
    updated_at: timestamp,
  });
  if (!inserted) {
    throw new Error("Script insert returned no row");
  }
  return inserted;
}

export async function getScriptUsage(args: {
  workspaceId: string;
  scriptId: number;
  excludeCampaignId?: number;
  tdb?: TenantDb;
}): Promise<ScriptUsage> {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const campaignWhere =
    args.excludeCampaignId === undefined
      ? eq(campaignTable.script_id, args.scriptId)
      : and(
          eq(campaignTable.script_id, args.scriptId),
          ne(campaignTable.id, args.excludeCampaignId),
        );
  const [campaignCount, inboundNumberCount] = await Promise.all([
    tdb.campaign.count({ where: campaignWhere }),
    tdb.workspace_number.count({
      where: eq(workspaceNumberTable.inbound_script_id, args.scriptId),
    }),
  ]);
  return {
    campaignCount,
    inboundNumberCount,
    totalCount: campaignCount + inboundNumberCount,
  };
}

export async function persistWorkspaceScript(
  args: PersistenceContext & WorkspaceScriptSave,
): Promise<ScriptRow | null> {
  const tdb = args.tdb ?? createTenantDb(args.workspaceId);
  const timestamp = args.timestamp ?? new Date().toISOString();

  switch (args.mode) {
    case "create":
      return insertScript(tdb, args.content, args.actorId, timestamp);
    case "copy": {
      if (args.sourceScriptId !== undefined) {
        const source = await tdb.script.findFirst({
          where: eq(scriptTable.id, args.sourceScriptId),
          columns: { id: true },
        });
        if (!source) return null;
      }
      return insertScript(
        tdb,
        { ...args.content, name: copiedScriptName(args.content.name) },
        args.actorId,
        timestamp,
      );
    }
    case "update": {
      const [updated] = await tdb.script.update({
        set: {
          ...scriptContentFields(args.content),
          updated_by: args.actorId,
          updated_at: timestamp,
        },
        where: eq(scriptTable.id, args.scriptId),
      });
      return updated ?? null;
    }
    default: {
      const exhaustive: never = args;
      return exhaustive;
    }
  }
}

export async function persistCampaignScript(args: {
  workspaceId: string;
  campaignId: number;
  scriptId?: number;
  content: ScriptContent;
  actorId: string;
  saveAsCopy: boolean;
  timestamp?: string;
  dbInstance?: Database;
}): Promise<ScriptRow> {
  const database = args.dbInstance ?? db;
  return database.transaction(
    async (txRaw) => {
      const tdb = createTenantDb(args.workspaceId, txRaw as unknown as Database);
      const saved = await persistCampaignScriptWithTenantDb({
        ...args,
        tdb,
      });

      const [linkedCampaign] = await tdb.campaign.update({
        set: { script_id: saved.id },
        where: eq(campaignTable.id, args.campaignId),
      });
      if (!linkedCampaign) {
        throw new Error("Campaign not found");
      }
      return saved;
    },
    { isolationLevel: "serializable" },
  );
}

export async function persistCampaignScriptWithTenantDb(args: {
  workspaceId: string;
  campaignId: number;
  scriptId?: number;
  content: ScriptContent;
  actorId: string;
  saveAsCopy: boolean;
  timestamp?: string;
  tdb: TenantDb;
}): Promise<ScriptRow> {
  const timestamp = args.timestamp ?? new Date().toISOString();
  if (args.scriptId === undefined) {
    return insertScript(args.tdb, args.content, args.actorId, timestamp);
  }

  const original = await args.tdb.script.findFirst({
    where: eq(scriptTable.id, args.scriptId),
  });
  if (!original) {
    throw new Error("Script not found");
  }

  const usage = await getScriptUsage({
    workspaceId: args.workspaceId,
    scriptId: args.scriptId,
    excludeCampaignId: args.campaignId,
    tdb: args.tdb,
  });
  const shouldCopy = args.saveAsCopy || usage.totalCount > 0;

  if (shouldCopy) {
    const name =
      original.name === args.content.name
        ? copiedScriptName(args.content.name)
        : args.content.name;
    return insertScript(
      args.tdb,
      { ...args.content, name },
      args.actorId,
      timestamp,
    );
  }

  const [updated] = await args.tdb.script.update({
    set: {
      ...scriptContentFields(args.content),
      updated_by: args.actorId,
      updated_at: timestamp,
    },
    where: eq(scriptTable.id, args.scriptId),
  });
  if (!updated) {
    throw new Error("Script not found");
  }
  return updated;
}
