import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Campaign, IVRCampaign, MessageCampaign } from "@/lib/types";
import { getCampaignReadiness, type CampaignReadinessCode, type CampaignReadinessIssue } from "@/lib/campaign-readiness";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { launchCampaign, scriptRoutingIssue } from "@/lib/campaign-execution.server";
import { getCampaignReadinessAction } from "@/lib/campaign-readiness-actions";

const mocks = vi.hoisted(() => ({
  enqueueRegisteredJob: vi.fn(async () => ({ enqueued: true, jobId: 99 })),
  updateCampaignStatusInWorkspace: vi.fn(async () => undefined),
  scriptFindFirst: vi.fn(async () => ({ steps: {
    pages: { page_1: { id: "page_1", title: "Menu", blocks: ["a"] } },
    blocks: { a: { id: "a", type: "recorded", options: [{ value: "1", next: "block_missing" }] } },
  } })),
}));
vi.mock("@/lib/worker/job-params.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/worker/job-params.server")>()),
  enqueueRegisteredJob: mocks.enqueueRegisteredJob,
}));
vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/campaign-ivr.server")>()),
  updateCampaignStatusInWorkspace: mocks.updateCampaignStatusInWorkspace,
}));
vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: () => ({ script: { findFirst: mocks.scriptFindFirst } }),
}));
beforeEach(() => vi.clearAllMocks());

const NOW = new Date("2026-10-03T12:00:00.000Z");
const validSchedule = { monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] } };
function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    allow_bulk_local_send: false, body_text: null, caller_id: "+15555550100",
    created_at: "2026-10-01T00:00:00Z", dial_ratio: 1, dial_type: "call",
    disposition_options: null, end_date: "2026-10-04T12:00:00.000Z",
    group_household_queue: true, id: 42, is_sample: false, live_questions: null,
    message_media: null, next_queue_order: 1, schedule: validSchedule,
    script_id: null, sms_messaging_service_sid: null, sms_send_mode: null,
    sms_send_window: null, start_date: "2026-10-01T12:00:00.000Z", status: "draft",
    title: "Outreach", type: "message", voicemail_drop_enabled: false,
    voicemail_file: null, voicedrop_audio: null, workspace: "workspace-1", ...overrides,
  };
}
function message(overrides: Partial<NonNullable<MessageCampaign>> = {}): MessageCampaign {
  return { body_text: "Hello", campaign_id: 42, created_at: "2026-10-01T00:00:00Z",
    id: 42, message_media: [], workspace: "workspace-1", ...overrides };
}
const voice: IVRCampaign = { campaign_id: 42, created_at: "2026-10-01T00:00:00Z", id: 42, script_id: 7, workspace: "workspace-1" };
type Options = NonNullable<Parameters<typeof getCampaignReadiness>[2]>;
function readiness(overrides: Partial<Campaign> = {}, options: Options = {}, details = message()) {
  return getCampaignReadiness(campaign(overrides), details, { queueCount: 1, now: NOW, ...options });
}

afterEach(() => vi.useRealTimers());

describe("campaign expiry readiness", () => {
  test.each([{ type: "message" }, { type: "live_call" }])("expired $type blocks start and schedule", ({ type }) => {
    const data = campaign({ type, end_date: "2026-10-03T11:59:59.999Z" });
    const result = getCampaignReadiness(data, type === "message" ? message() : voice, { queueCount: 1, now: NOW });
    expect(result.issues.map(issue => issue.code)).toEqual(["campaign_ended"]);
    expect(result.startDisabledReason).toBeTruthy();
    expect(result.scheduleDisabledReason).toBeTruthy();
    expect(result.startIssues).toContain(result.startDisabledReason);
  });
  test.each([{ end: "2026-10-03T12:00:00.000Z" }, { end: "2026-10-03T12:00:00.001Z" }])("equal or future end $end stays ready", ({ end }) => {
    const result = readiness({ end_date: end });
    expect(result.issues).toEqual([]);
    expect(result.startDisabledReason).toBeNull();
    expect(result.scheduleDisabledReason).toBeNull();
  });
  test("the default clock blocks an expired campaign", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const result = getCampaignReadiness(campaign({ end_date: "2026-10-03T11:59:59.999Z" }), message(), { queueCount: 1 });
    expect(result.issues.map(issue => issue.code)).toEqual(["campaign_ended"]);
  });
  test("an explicit clock overrides the machine clock", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2030-01-01T00:00:00Z");
    expect(readiness().issues).toEqual([]);
  });
  test("invalid and reversed dates keep their earlier correction", () => {
    expect(readiness({ end_date: "invalid" }).issues.map(issue => issue.code)).toEqual(["dates_invalid"]);
    expect(readiness({ start_date: "2026-10-04", end_date: "2026-10-02" }).issues.map(issue => issue.code)).toEqual(["start_after_end"]);
  });
  test("expired date correction uses the schedule pickers", () => {
    expect(getCampaignReadinessAction("campaign_ended")).toEqual({
      type: "scroll", targetId: "campaign-setup-schedule", label: "Update campaign dates",
    });
  });
});

const producerFixtures = {
  campaign_not_loaded: () => getCampaignReadiness(null, null).issues,
  campaign_type_required: () => readiness({ type: null }).issues,
  outbound_number_required: () => readiness({ caller_id: null }).issues,
  outbound_number_unavailable: () => readiness({}, { workspacePhoneNumbers: [] }).issues,
  outbound_number_incapable: () => readiness({}, { workspacePhoneNumbers: [{ phone_number: "+15555550100", capabilities: { sms: false } }] }).issues,
  messaging_sid_required: () => readiness({ caller_id: null, sms_send_mode: "messaging_service" }).issues,
  messaging_senders_unavailable: () => readiness({ sms_send_mode: "messaging_service", sms_messaging_service_sid: "MG1" }, { smsMessagingServiceSendersReady: false }).issues,
  dates_required: () => readiness({ end_date: null }).issues,
  dates_invalid: () => readiness({ start_date: "invalid" }).issues,
  start_after_end: () => readiness({ start_date: "2026-10-05" }).issues,
  campaign_ended: () => readiness({ end_date: "2026-10-02" }).issues,
  calling_hours_required: () => getCampaignReadiness(campaign({ type: "live_call", schedule: null }), voice, { now: NOW }).issues,
  send_window_required: () => readiness({ sms_send_window: {} }).issues,
  invalid_intervals: () => readiness({ sms_send_window: { monday: { active: true, intervals: [{ start: "09:00", end: "09:00" }] } } }).issues,
  queue_empty: () => readiness({}, { queueCount: 0 }).issues,
  bulk_sender_misaligned: () => readiness({}, { queueCount: 500, smsSenderClass: "ca_local" }).issues,
  script_required: () => getCampaignReadiness(campaign({ type: "live_call" }), { ...voice, script_id: null }, { now: NOW }).issues,
  script_unavailable: () => getCampaignReadiness(campaign({ type: "live_call" }), voice, { now: NOW, workspaceScriptIds: [] }).issues,
  audio_unavailable: () => readiness({ voicemail_file: "missing.mp3" }, { workspaceAudioNames: [] }).issues,
  voicemail_audio_required: () => getCampaignReadiness(campaign({ type: "live_call", voicemail_drop_enabled: true }), voice, { now: NOW }).issues,
  message_content_required: () => readiness({}, {}, message({ body_text: "" })).issues,
  script_routing_invalid: async () => {
    const issue = await scriptRoutingIssue("workspace-1", campaign({ type: "robocall" }), voice);
    return issue ? [issue] : [];
  },
} satisfies Record<CampaignReadinessCode, () => CampaignReadinessIssue[] | Promise<CampaignReadinessIssue[]>>;


describe("every readiness code has a real producer", () => {
  test.each(Object.entries(producerFixtures))("%s is emitted for its failing configuration", async (code, produce) => {
    expect((await produce()).map(issue => issue.code)).toContain(code);
  });
  test("a new union code requires a producer fixture", () => {
    const source = ts.createSourceFile("campaign-readiness.ts", readFileSync(new URL("../app/lib/campaign-readiness.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === "CampaignReadinessCode");
    if (!declaration || !ts.isTypeAliasDeclaration(declaration) || !ts.isUnionTypeNode(declaration.type)) throw new Error("Missing readiness code union");
    const codes = declaration.type.types.map(node => {
      if (!ts.isLiteralTypeNode(node) || !ts.isStringLiteral(node.literal)) throw new Error("Unexpected readiness code type");
      return node.literal.text;
    });
    expect(Object.keys(producerFixtures).sort()).toEqual(codes.sort());
  });
});

describe("launch uses the same readiness clock", () => {
  test("an expired launch returns its issue without writes", async () => {
    const result = await launchCampaign({
      workspaceId: "workspace-1", campaignId: "42", userId: "user-1", mode: "now",
      campaign: campaign({ end_date: "2026-10-03T11:59:59.999Z" }), campaignDetails: message(), queueCount: 1, now: NOW,
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "campaign_ended" } });
    expect(mocks.updateCampaignStatusInWorkspace).not.toHaveBeenCalled();
    expect(mocks.enqueueRegisteredJob).not.toHaveBeenCalled();
  });
  test.each([{ end: "2026-10-03T12:00:00.000Z" }, { end: "2026-10-03T12:00:00.001Z" }])("end $end launches with an explicit clock despite a later machine clock", async ({ end }) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2030-01-01T00:00:00Z");
    const result = await launchCampaign({
      workspaceId: "workspace-1", campaignId: "42", userId: "user-1", mode: "now",
      campaign: campaign({ end_date: end }), campaignDetails: message(), queueCount: 1, now: NOW,
    });
    expect(result).toMatchObject({ ok: true, status: "running" });
    expect(mocks.updateCampaignStatusInWorkspace).toHaveBeenCalledWith("workspace-1", 42, { status: "running" });
    expect(mocks.enqueueRegisteredJob).toHaveBeenCalledTimes(1);
  });
});
