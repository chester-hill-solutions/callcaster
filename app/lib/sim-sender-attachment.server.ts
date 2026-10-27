import type { ResolvedSimProfile } from "../../e2e/sim/personas";

export type VerifiedSender = Readonly<{
  sid: string; accountSid: string; phoneNumber: string; friendlyName: string | null;
  capabilities: Readonly<{ sms: boolean; mms: boolean; voice: boolean; fax: boolean }>;
}>;
export type SenderRow = Readonly<{ id: number; workspace: string; type: string; phone_number: string | null; twilio_phone_number_sid: string | null; friendly_name: string | null; capabilities: unknown }>;
export type SenderRepository = Readonly<{
  rows(phone: string, sid?: string): Promise<SenderRow[]>;
  insert(input: Omit<SenderRow, "id">): Promise<SenderRow>;
  audit(action: string, metadata: Record<string, unknown>): Promise<void>;
}>;
export type SenderTransaction = <T>(fn: (repo: SenderRepository) => Promise<T>) => Promise<T>;

export class SimSenderAttachmentError extends Error {
  constructor(message: string) { super(message); this.name = "SimSenderAttachmentError"; }
}

export function normalizeSimPhone(value: string): string {
  if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new SimSenderAttachmentError("Phone must be E.164");
  return value;
}

export async function attachSimSender(input: {
  profile: ResolvedSimProfile; workspaceId: string; phone: string; globalSender: string; expectedAccountSid: string;
  providerRows: readonly VerifiedSender[]; transaction: SenderTransaction;
}): Promise<{ status: "attached" | "reused"; phoneLast4: string; capabilities: VerifiedSender["capabilities"] }> {
  if (input.profile.environment !== "local") throw new SimSenderAttachmentError("Sender attachment is local only");
  const phone = normalizeSimPhone(input.phone);
  if (input.globalSender && normalizeSimPhone(input.globalSender) === phone) throw new SimSenderAttachmentError("Global fallback sender cannot be attached");
  if (input.providerRows.length !== 1) throw new SimSenderAttachmentError("Provider result is missing or ambiguous");
  const provider = input.providerRows[0]!;
  if (provider.phoneNumber !== phone || !provider.sid || provider.accountSid !== input.expectedAccountSid) throw new SimSenderAttachmentError("Provider ownership does not match the requested sender");
  if (!provider.capabilities.sms) throw new SimSenderAttachmentError("Provider sender does not support SMS");

  return input.transaction(async (repo) => {
    const rows = await repo.rows(phone, provider.sid);
    const bySid = rows.filter((row) => row.twilio_phone_number_sid === provider.sid);
    const byNumber = rows.filter((row) => row.phone_number === phone);
    if (rows.some((row) => row.workspace !== input.workspaceId)) {
      throw new SimSenderAttachmentError("An unknown or other-workspace number row already exists");
    }
    const markerRow = rows.length === 1 ? rows[0] : undefined;
    if (markerRow) {
      const expected = { simMarker: input.profile.workspaceMarker, provenance: "provider-verified-existing-sender", accountSid: provider.accountSid, capabilities: provider.capabilities };
      if (bySid.length !== 1 || byNumber.length !== 1 || markerRow.twilio_phone_number_sid !== provider.sid || markerRow.phone_number !== phone || markerRow.type !== "sim_existing" || JSON.stringify(markerRow.capabilities) !== JSON.stringify(expected)) throw new SimSenderAttachmentError("Existing sender row does not match this SIM attachment");
      return { status: "reused", phoneLast4: phone.slice(-4), capabilities: provider.capabilities };
    }
    if (bySid.length || byNumber.length) throw new SimSenderAttachmentError("Duplicate sender record exists");
    const capabilities = { simMarker: input.profile.workspaceMarker, provenance: "provider-verified-existing-sender", accountSid: provider.accountSid, capabilities: provider.capabilities };
    await repo.insert({ workspace: input.workspaceId, type: "sim_existing", phone_number: phone, twilio_phone_number_sid: provider.sid, friendly_name: provider.friendlyName, capabilities });
    await repo.audit("sim.sender.attached", { persona: input.profile.personaKey, workspaceMarker: input.profile.workspaceMarker, phoneLast4: phone.slice(-4), capabilities: provider.capabilities, provenance: "provider-verified-existing-sender" });
    return { status: "attached", phoneLast4: phone.slice(-4), capabilities: provider.capabilities };
  });
}

export async function getSimSenderStatus(profile: ResolvedSimProfile, workspaceId: string, transaction: SenderTransaction) {
  if (profile.environment !== "local") throw new SimSenderAttachmentError("Sender status is local only");
  return transaction(async (repo) => {
    const rows = await repo.rows("");
    if (rows.length === 0) return { status: "missing" as const, phoneLast4: null, capabilities: null, provenance: null };
    const row = rows[0]!;
    if (rows.length !== 1 || row.type !== "sim_existing" || row.workspace !== workspaceId || (row.capabilities as { simMarker?: string } | null)?.simMarker !== profile.workspaceMarker) return { status: "blocked" as const, phoneLast4: null, capabilities: null, provenance: null };
    return { status: "ready" as const, phoneLast4: row.phone_number?.slice(-4) ?? null, capabilities: (row.capabilities as { capabilities?: unknown })?.capabilities ?? null, provenance: (row.capabilities as { provenance?: unknown })?.provenance ?? null };
  });
}
