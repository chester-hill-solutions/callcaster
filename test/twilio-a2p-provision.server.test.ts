import { beforeEach, describe, expect, test, vi } from "vitest";
import { Twilio } from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import { onboardingFixture } from "./fixtures/onboarding";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});
const state = vi.hoisted(() => ({ twilioData: {} as Record<string, unknown> }));
const adminDb = vi.hoisted(() => {
  const rows = async () => [{ id: "w1", twilio_data: state.twilioData }];
  const client = {
    select: () => ({ from: () => ({ where: () => ({ limit: rows, for: () => ({ limit: rows }) }) }) }),
    update: () => ({ set: (values: { twilio_data: unknown }) => ({ where: async () => {
      state.twilioData = typeof values.twilio_data === "string"
        ? JSON.parse(values.twilio_data) : JSON.parse(JSON.stringify(values.twilio_data));
    } }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return client;
});
vi.mock("@/server/admin-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-db")>()), adminDb,
}));
let sdk: Twilio;
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async () => sdk,
}));
vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return { ...actual, env: { ...actual.env, BASE_URL: () => "https://callcaster.test" } };
});
const boundaries = vi.hoisted(() => ({ bootstrap: vi.fn(), alert: vi.fn() }));
vi.mock("@/lib/twilio-bootstrap.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-bootstrap.server")>()),
  ensureWorkspaceTwilioBootstrap: (...args: unknown[]) => boundaries.bootstrap(...args),
}));
vi.mock("@/lib/twilio-event-streams.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-event-streams.server")>()),
  ensureA2pEventStreamsSink: async () => ({ sinkSid: null, subscriptionSid: null, status: null, error: null }),
}));
vi.mock("@/lib/twilio-compliance-notify.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-compliance-notify.server")>()),
  sendComplianceOpsAlert: (...args: unknown[]) => boundaries.alert(...args),
}));
vi.mock("@/lib/twilio-geo-permissions.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-geo-permissions.server")>()),
  ensureVoiceGeoPermissions: async () => ({ ok: true }),
  preflightNumberPurchase: async () => [],
}));
vi.mock("@/lib/twilio-sender-pool.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-sender-pool.server")>()),
  verifyWorkspaceMessagingSenderPool: async () => ({ serviceSid: "MG123", inSync: true, missingFromPool: [], livePhoneNumbers: ["+15555551212"] }),
}));

import { provisionA2pRegistration } from "@/lib/twilio-a2p-provision.server";
import { runWorkspaceTwilioComplianceJob } from "@/lib/twilio-compliance-job.server";
import { getWorkspaceMessagingOnboardingFromTwilioData } from "@/lib/messaging-onboarding.server";
import { assertWorkspaceCanSendSms } from "@/lib/twilio-readiness.server";
import { invalidateWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";

const profileSid = `BU${"1".repeat(32)}`;
const productSid = `BU${"2".repeat(32)}`;
const brandSid = `BN${"3".repeat(32)}`;
const campaignSid = `QE${"4".repeat(32)}`;
const serviceSid = "MG123";
const description = "Appointment reminders for patients of Acme Health.";
const flow = "Patients select an SMS consent checkbox on the Acme appointment form.";
const samples = ["Acme Health: Your appointment is tomorrow. Reply STOP to stop.", "Acme Health: Please confirm your appointment time. Reply STOP to stop."];
const args = { workspaceId: "w1", actorUserId: "u1", customerProfileBundleSid: profileSid };
let brandStatus: string;
let campaignStatus: string;
let existingCampaign: boolean;
let omitCampaignSid: boolean;
let failOperation: "create" | "list" | "brand" | null;
let request: ReturnType<typeof vi.spyOn<RequestClient, "request">>;

function stored() {
  return getWorkspaceMessagingOnboardingFromTwilioData(state.twilioData);
}
function seed(options: { brand?: boolean; campaign?: boolean; staleError?: boolean } = {}) {
  state.twilioData = {
    sid: `AC${"5".repeat(32)}`, authToken: "fixture-token", untouched: "keep",
    portalSync: { lastSyncStatus: "healthy", tollFreeVerificationBlocked: false, tollFreeVerificationCheckedAt: "2026-10-03T10:00:00Z" },
    onboarding: onboardingFixture({
      operatingCountry: "US", selectedChannels: ["a2p10dlc"],
      messagingService: { ...onboardingFixture().messagingService, serviceSid },
      businessProfile: { ...onboardingFixture().businessProfile, legalBusinessName: "Acme Health", websiteUrl: "https://acme.test", supportEmail: "support@acme.test", useCaseSummary: description, optInWorkflow: flow, sampleMessages: samples },
      a2p10dlc: { ...onboardingFixture().a2p10dlc, customerProfileBundleSid: profileSid, trustProductSid: productSid, brandSid: options.brand === false ? null : brandSid, campaignSid: options.campaign ? campaignSid : null, status: options.staleError ? "rejected" : "approved", rejectionReason: options.staleError ? "Old campaign failure" : null },
      reviewState: { blockingIssues: [], lastError: options.staleError ? "Old provider error" : null, lastUpdatedAt: null },
    }),
  };
  invalidateWorkspaceTwilioData("w1");
}
function installProvider() {
  const transport = new RequestClient();
  request = vi.spyOn(transport, "request").mockImplementation(async (input) => {
    const campaignPath = input.uri.includes("/Compliance/Usa2p");
    const brandPath = input.uri.includes("/BrandRegistrations");
    const failed = (campaignPath && ((input.method.toUpperCase() === "POST" && failOperation === "create") || (input.method.toUpperCase() === "GET" && failOperation === "list"))) || (brandPath && failOperation === "brand");
    if (failed) return { statusCode: 400, headers: {}, body: JSON.stringify({ code: 21610, message: "Provider rejected this A2P operation" }) };
    let body: unknown;
    if (campaignPath && input.method.toUpperCase() === "POST") {
      body = { sid: omitCampaignSid ? undefined : campaignSid, brand_registration_sid: brandSid, campaign_status: campaignStatus };
    } else if (campaignPath) {
      body = { us_app_to_person: existingCampaign ? [{ sid: campaignSid, brand_registration_sid: brandSid, campaign_status: campaignStatus }] : [], meta: { key: "us_app_to_person", next_page_url: null } };
    } else if (brandPath) {
      body = { sid: brandSid, status: brandStatus, failure_reason: brandStatus === "FAILED" ? "Business identity mismatch" : null };
    } else if (input.uri.includes("/EntityAssignments")) {
      body = { results: [{ sid: "BV123", object_sid: profileSid }], meta: { key: "results", next_page_url: null } };
    } else {
      throw new Error(`Unexpected SDK request: ${input.method} ${input.uri}`);
    }
    return { statusCode: input.method.toUpperCase() === "POST" ? 201 : 200, headers: {}, body: JSON.stringify(body) };
  });
  sdk = new Twilio(`AC${"5".repeat(32)}`, "fixture-token", { httpClient: transport });
}
function campaignCreates() {
  return request.mock.calls.map(([input]) => input).filter((input) => input.method.toUpperCase() === "POST" && input.uri.endsWith(`/Services/${serviceSid}/Compliance/Usa2p`));
}

describe("canonical A2P chain through installed SDK and actual stored state", () => {
  beforeEach(() => {
    vi.clearAllMocks(); brandStatus = "APPROVED"; campaignStatus = "IN_PROGRESS";
    existingCampaign = false; omitCampaignSid = false; failOperation = null;
    boundaries.bootstrap.mockResolvedValue({ outcome: "success", serviceSid });
    seed(); installProvider();
  });

  test.each(["legalBusinessName", "websiteUrl", "useCaseSummary", "optInWorkflow"] as const)("missing %s stops provisioning before provider calls", async (field) => {
    const current = stored(); state.twilioData.onboarding = { ...current, businessProfile: { ...current.businessProfile, [field]: "" } };
    invalidateWorkspaceTwilioData("w1");
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    expect(stored().reviewState.blockingIssues.length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalled();
  });

  test("creates and stores a service-scoped campaign with the provider payload", async () => {
    const result = await provisionA2pRegistration(args);
    expect(campaignCreates()).toHaveLength(1);
    expect(campaignCreates()[0].data).toMatchObject({ BrandRegistrationSid: brandSid, Description: description, MessageFlow: flow, MessageSamples: samples, UsAppToPersonUsecase: "LOW_VOLUME", HasEmbeddedLinks: "false", HasEmbeddedPhone: "false" });
    expect(result).toMatchObject({ status: "in_review", details: { campaignSid } });
    expect(stored().a2p10dlc.campaignSid).toBe(campaignSid);
    expect(state.twilioData.untouched).toBe("keep");
  });
  test("creates the brand, waits for approval and then resumes campaign creation", async () => {
    seed({ brand: false }); brandStatus = "PENDING";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({ brandSid, campaignSid: null, status: "in_review" });
    expect(campaignCreates()).toHaveLength(0);
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow("not approved");
    brandStatus = "APPROVED";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.campaignSid).toBe(campaignSid);
    expect(campaignCreates()).toHaveLength(1);
    expect(request.mock.calls.filter(([input]) => input.method.toUpperCase() === "POST" && input.uri.endsWith("/BrandRegistrations"))).toHaveLength(1);
  });
  test("reuses and stores an existing provider campaign without a duplicate", async () => {
    existingCampaign = true;
    await provisionA2pRegistration(args);
    expect(campaignCreates()).toHaveLength(0);
    expect(stored().a2p10dlc.campaignSid).toBe(campaignSid);
  });
  test.each(["create", "list", "brand"] as const)("worker records %s failure and removes stale approval", async (operation) => {
    failOperation = operation;
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    expect(stored().reviewState.lastError).toContain("Provider rejected");
    expect(stored().a2p10dlc.brandSid).toBe(brandSid);
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow("not approved");
    expect(boundaries.alert).toHaveBeenCalled();
    if (operation !== "create") expect(campaignCreates()).toHaveLength(0);
  });
  test("missing campaign SID cannot become a successful review result", async () => {
    omitCampaignSid = true;
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({ campaignSid: null, status: "rejected" });
    expect(stored().reviewState.lastError).toContain("Campaign SID was not returned");
  });
  test("successful retry clears stale errors and keeps reusable IDs", async () => {
    seed({ staleError: true });
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({ brandSid, campaignSid, status: "in_review", rejectionReason: null });
    expect(stored().reviewState).toMatchObject({ lastError: null, blockingIssues: [] });
  });
  test("both approved resources permit sending through the stored gate", async () => {
    seed({ campaign: true }); existingCampaign = true; campaignStatus = "VERIFIED";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("approved");
    await expect(assertWorkspaceCanSendSms(args)).resolves.toBeUndefined();
    expect(campaignCreates()).toHaveLength(0);
  });
  test("brand rejection stays visible and does not create a campaign", async () => {
    brandStatus = "FAILED";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    expect(stored().reviewState.blockingIssues).toContain("Business identity mismatch");
    expect(campaignCreates()).toHaveLength(0);
  });
  test("thrown bootstrap failure records an error and removes stale approval", async () => {
    seed({ campaign: true });
    boundaries.bootstrap.mockRejectedValue(new Error("Workspace Twilio credentials are missing"));
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    expect(stored().reviewState.lastError).toContain("Twilio credentials are missing");
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow("not approved");
    expect(request).not.toHaveBeenCalled();
  });
  test("a retry after campaign failure preserves the brand without creating it again", async () => {
    seed({ brand: false }); failOperation = "create";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({ brandSid, campaignSid: null, status: "rejected" });
    failOperation = null;
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({ brandSid, campaignSid, status: "in_review", rejectionReason: null });
    expect(stored().reviewState.lastError).toBeNull();
    expect(request.mock.calls.filter(([input]) => input.method.toUpperCase() === "POST" && input.uri.endsWith("/BrandRegistrations"))).toHaveLength(1);
  });
  test("missing sample messages stop the worker before provider calls", async () => {
    const current = stored(); state.twilioData.onboarding = { ...current, businessProfile: { ...current.businessProfile, sampleMessages: [] } };
    invalidateWorkspaceTwilioData("w1");
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    expect(request).not.toHaveBeenCalled();
  });

  test("bootstrap failure removes an older completed A2P approval", async () => {
    seed({ campaign: true });
    boundaries.bootstrap.mockResolvedValue({ outcome: "failed", serviceSid: null, lastError: "Bootstrap failed" });
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow("not approved");
    expect(request).not.toHaveBeenCalled();
  });
  test.each([{ brandSid: null, campaignSid }, { brandSid, campaignSid: null }])("stale approval with missing resource cannot permit sends: %j", async (ids) => {
    const current = stored(); state.twilioData.onboarding = { ...current, a2p10dlc: { ...current.a2p10dlc, ...ids } };
    invalidateWorkspaceTwilioData("w1");
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow("not approved");
  });
});
