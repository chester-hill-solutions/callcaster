import { and, eq, or, sql } from "drizzle-orm";
import { workspace, workspace_number, workspace_audit_event } from "@/db/schema";
import { attachSimSender, getSimSenderStatus, type SenderRepository, type VerifiedSender } from "@/lib/sim-sender-attachment.server";
import type { ResolvedSimProfile } from "../../e2e/sim/personas";

async function markedWorkspace(profile: ResolvedSimProfile) {
  const [{ db }] = await Promise.all([import("@/server/db")]);
  const rows = await db.select({ id: workspace.id, data: workspace.twilio_data }).from(workspace).where(and(eq(workspace.name, profile.workspaceName), eq(workspace.sim_marker, profile.workspaceMarker)));
  if (rows.length !== 1) throw new Error("Marked SIM workspace is missing or ambiguous");
  return rows[0]!;
}

async function markedWorkspaceId(profile: ResolvedSimProfile): Promise<string> {
  const [{ db }] = await Promise.all([import("@/server/db")]);
  const rows = await db.select({ id: workspace.id }).from(workspace).where(and(eq(workspace.name, profile.workspaceName), eq(workspace.sim_marker, profile.workspaceMarker)));
  if (rows.length !== 1) throw new Error("Marked SIM workspace is missing or ambiguous");
  return rows[0]!.id;
}

async function withSimSenderTransaction<T>(workspaceId: string, fn: (repo: SenderRepository) => Promise<T>): Promise<T> {
  const [{ db }] = await Promise.all([import("@/server/db")]);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sim-sender-global'))`);
    return fn({
      rows: async (phone, sid) => phone && sid ? tx.select().from(workspace_number).where(or(eq(workspace_number.phone_number, phone), eq(workspace_number.twilio_phone_number_sid, sid))) : tx.select().from(workspace_number).where(eq(workspace_number.workspace, workspaceId)),
      insert: async (values) => { const [row] = await tx.insert(workspace_number).values(values).returning(); if (!row) throw new Error("Could not save sender"); return row; },
      audit: async (action, metadata) => { await tx.insert(workspace_audit_event).values({ workspace_id: workspaceId, actor_type: "system", action, outcome: "success", metadata }); },
    });
  });
}

export async function attachSimSenderInDatabase(profile: ResolvedSimProfile, phone: string, globalSender: string, providerRows: readonly VerifiedSender[]) {
  if (profile.environment !== "local") throw new Error("SIM sender attachment is local only");
  const target = await markedWorkspace(profile);
  let twilioData: { sid?: string; account_sid?: string } | null = null;
  try { twilioData = JSON.parse(String(target.data)) as { sid?: string; account_sid?: string }; } catch { /* fail closed below */ }
  const accountSid = twilioData?.sid ?? twilioData?.account_sid;
  if (!accountSid) throw new Error("SIM workspace has no Twilio account SID");
  const result = await attachSimSender({ profile, workspaceId: target.id, phone, globalSender, expectedAccountSid: accountSid, providerRows, transaction: (fn) => withSimSenderTransaction(target.id, fn) });
  return { ...result, workspaceMarker: profile.workspaceMarker };
}

export async function getSimSenderStatusInDatabase(profile: ResolvedSimProfile) {
  if (profile.environment !== "local") throw new Error("SIM sender status is local only");
  const workspaceId = await markedWorkspaceId(profile);
  return getSimSenderStatus(profile, workspaceId, (fn) => withSimSenderTransaction(workspaceId, fn));
}

export async function findSimSenderWorkspace(profile: ResolvedSimProfile) { return markedWorkspace(profile); }
