import { describe, expect, test, vi } from "vitest";
import { attachSimSender, getSimSenderStatus, type SenderRepository, type SenderRow, type VerifiedSender } from "@/lib/sim-sender-attachment.server";
import type { ResolvedSimProfile } from "../e2e/sim/personas";

const profile = { environment: "local", personaKey: "person-a", workspaceMarker: "sim:dev-local", runtimeIdentity: "dev-local" } as ResolvedSimProfile;
const provider: VerifiedSender = { sid: "PN123", accountSid: "AC123", phoneNumber: "+14165550123", friendlyName: "SIM", capabilities: { sms: true, mms: false, voice: true, fax: false } };
const row = (capabilities: unknown = { simMarker: profile.workspaceMarker, provenance: "provider-verified-existing-sender", accountSid: provider.accountSid, capabilities: provider.capabilities }): SenderRow => ({ id: 1, workspace: "ws", type: "sim_existing", status: "active", phone_number: provider.phoneNumber, twilio_phone_number_sid: provider.sid, friendly_name: "SIM", capabilities });
function repo(initial: SenderRow[] = [], failAudit = false) {
  const state = [...initial];
  const audit = vi.fn(async () => { if (failAudit) throw new Error("audit failed"); });
  const repository: SenderRepository = {
    rows: async (phone, sid) => phone ? state.filter((r) => r.phone_number === phone || r.twilio_phone_number_sid === sid) : state,
    insert: async (value) => { const inserted = { ...value, id: 2 }; state.push(inserted); return inserted; },
    audit,
  };
  return { state, audit, transaction: async <T>(fn: (r: SenderRepository) => Promise<T>) => {
    const before = state.length;
    try { return await fn(repository); } catch (error) { state.length = before; throw error; }
  } };
}
const call = (db: ReturnType<typeof repo>, options: Partial<{ phone: string; global: string; providers: VerifiedSender[] }> = {}) => attachSimSender({ profile, workspaceId: "ws", phone: options.phone ?? provider.phoneNumber, globalSender: options.global ?? "+14165550999", expectedAccountSid: "AC123", providerRows: options.providers ?? [provider], transaction: db.transaction });

describe("safe local SIM sender attachment", () => {
  test("rejects hosted profile before transaction or provider-dependent work", async () => {
    const db = repo();
    await expect(attachSimSender({ profile: { ...profile, environment: "staging" }, workspaceId: "ws", phone: provider.phoneNumber, globalSender: "", expectedAccountSid: provider.accountSid, providerRows: [provider], transaction: db.transaction })).rejects.toThrow(/local only/);
    expect(db.state).toHaveLength(0);
  });
  test("attaches verified owned SMS sender with metadata and redacted audit", async () => {
    const db = repo();
    const result = await call(db);
    expect(result.status).toBe("attached");
    expect(db.state[0]?.type).toBe("sim_existing");
    expect(db.state[0]?.capabilities).toMatchObject({ provenance: "provider-verified-existing-sender", accountSid: "AC123", simMarker: profile.workspaceMarker });
    expect(JSON.stringify(db.audit.mock.calls)).not.toContain(provider.phoneNumber);
    expect(JSON.stringify(db.audit.mock.calls)).not.toContain(provider.sid);
  });
  test.each([
    { name: "wrong account", providers: [{ ...provider, accountSid: "AC-other" }] },
    { name: "missing provider SID", providers: [{ ...provider, sid: "" }] },
    { name: "missing result", providers: [] },
    { name: "ambiguous result", providers: [provider, provider] },
    { name: "no SMS capability", providers: [{ ...provider, capabilities: { ...provider.capabilities, sms: false } }] },
  ])("rejects $name", async ({ providers }) => { await expect(call(repo(), { providers })).rejects.toThrow(); });
  test("rejects global fallback and another workspace's existing row", async () => {
    await expect(call(repo(), { global: provider.phoneNumber })).rejects.toThrow(/Global fallback/);
    const foreign = { ...row(), workspace: "foreign" };
    await expect(call(repo([foreign]))).rejects.toThrow(/other-workspace/);
  });
  test("reuses only the exact SIM sender and blocks a changed sender", async () => {
    expect((await call(repo([row()]))).status).toBe("reused");
    await expect(call(repo([row()], false), { phone: "+14165550124", providers: [{ ...provider, phoneNumber: "+14165550124" }] })).rejects.toThrow();
    await expect(call(repo([row({ ...(row().capabilities as object), provenance: "unknown" })]))).rejects.toThrow(/does not match/);
  });
  test("reuses metadata with database JSONB key order", async () => {
    const reordered = { capabilities: provider.capabilities, accountSid: provider.accountSid, provenance: "provider-verified-existing-sender", simMarker: profile.workspaceMarker };
    expect((await call(repo([row(reordered)]))).status).toBe("reused");
  });
  test("refuses a released attachment and reports it blocked", async () => {
    const db = repo([{ ...row(), status: "released" }]);
    await expect(call(db)).rejects.toThrow(/does not match/);
    expect(await getSimSenderStatus(profile, "ws", db.transaction)).toMatchObject({ status: "blocked" });
  });
  test("rolls back insertion when audit fails", async () => {
    const db = repo([], true);
    await expect(call(db)).rejects.toThrow("audit failed");
    expect(db.state).toHaveLength(0);
  });
  test("status is redacted and does not call a provider", async () => {
    const db = repo([row()]);
    const status = await getSimSenderStatus(profile, "ws", db.transaction);
    expect(status).toMatchObject({ status: "ready", phoneLast4: "0123", provenance: "provider-verified-existing-sender" });
    expect(JSON.stringify(status)).not.toContain(provider.phoneNumber);
    expect(JSON.stringify(status)).not.toContain(provider.sid);
  });
});
