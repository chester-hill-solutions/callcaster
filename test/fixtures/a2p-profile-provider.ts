import { vi } from "vitest";
import { Twilio } from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import { onboardingFixture } from "./onboarding";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});
const state = vi.hoisted(() => ({
  twilioData: {} as Record<string, unknown>,
  failSidWrite: null as string | null,
  afterReadyWrite: null as (() => Promise<void>) | null,
  beforeLockedRead: null as (() => Promise<void>) | null,
}));
const adminDb = vi.hoisted(() => {
  const rows = async () => [{ id: "w1", twilio_data: state.twilioData }];
  const lockedRows = async () => {
    const hook = state.beforeLockedRead;
    state.beforeLockedRead = null;
    await hook?.();
    return rows();
  };
  const client = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: rows, for: () => ({ limit: lockedRows }) }),
      }),
    }),
    update: () => ({
      set: (values: { twilio_data: unknown }) => ({
        where: async () => {
          const next =
            typeof values.twilio_data === "string"
              ? JSON.parse(values.twilio_data)
              : JSON.parse(JSON.stringify(values.twilio_data));
          if (
            state.failSidWrite &&
            next.onboarding?.a2p10dlc?.[state.failSidWrite]
          ) {
            state.failSidWrite = null;
            throw new Error("Fixture SID persistence failed");
          }
          state.twilioData = next;
          if (
            state.afterReadyWrite &&
            next.onboarding?.a2p10dlc?.messagingProfileStatus === "ready"
          ) {
            const hook = state.afterReadyWrite;
            state.afterReadyWrite = null;
            await hook();
          }
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return client;
});
vi.mock("@/server/admin-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-db")>()),
  adminDb,
}));
let sdk: Twilio;
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async () => sdk,
}));
vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return {
    ...actual,
    env: { ...actual.env, BASE_URL: () => "https://callcaster.test" },
  };
});
const boundaries = vi.hoisted(() => ({ bootstrap: vi.fn(), alert: vi.fn() }));
vi.mock("@/lib/twilio-bootstrap.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-bootstrap.server")>()),
  ensureWorkspaceTwilioBootstrap: (...args: unknown[]) =>
    boundaries.bootstrap(...args),
}));
vi.mock("@/lib/twilio-event-streams.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/twilio-event-streams.server")
  >()),
  ensureA2pEventStreamsSink: async () => ({
    sinkSid: null,
    subscriptionSid: null,
    status: null,
    error: null,
  }),
}));
vi.mock("@/lib/twilio-compliance-notify.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/twilio-compliance-notify.server")
  >()),
  sendComplianceOpsAlert: (...args: unknown[]) => boundaries.alert(...args),
}));
vi.mock("@/lib/twilio-geo-permissions.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/twilio-geo-permissions.server")
  >()),
  ensureVoiceGeoPermissions: async () => ({ ok: true }),
  preflightNumberPurchase: async () => [],
}));
vi.mock("@/lib/twilio-sender-pool.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-sender-pool.server")>()),
  verifyWorkspaceMessagingSenderPool: async () => ({
    serviceSid: "MG123",
    inSync: true,
    missingFromPool: [],
    livePhoneNumbers: ["+15555551212"],
  }),
}));

import {
  updateWorkspaceMessagingOnboardingState,
  getWorkspaceMessagingOnboardingFromTwilioData,
} from "@/lib/messaging-onboarding.server";
import { invalidateWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";

const profileSid = `BU${"1".repeat(32)}`;
const productSid = `BU${"2".repeat(32)}`;
const brandSid = `BN${"3".repeat(32)}`;
const campaignSid = `QE${"4".repeat(32)}`;
const serviceSid = "MG123";
const endUserSid = `IT${"6".repeat(32)}`;
const policySid = "RNb0d4771c2c98518d916a3d4cd70a8f8b";
const description = "Appointment reminders for patients of Acme Health.";
const flow =
  "Patients select an SMS consent checkbox on the Acme appointment form.";
const samples = [
  "Acme Health: Your appointment is tomorrow. Reply STOP to stop.",
  "Acme Health: Please confirm your appointment time. Reply STOP to stop.",
];
const args = {
  workspaceId: "w1",
  actorUserId: "u1",
  customerProfileBundleSid: profileSid,
};

type ProviderState = {
  brandStatus: string;
  campaignStatus: string;
  existingCampaign: boolean;
  omitCampaignSid: boolean;
  failOperation: "create" | "list" | "brand" | null;
  productExists: boolean;
  userExists: boolean;
  productStatus: string;
  providerAttributes: Record<string, string>;
  assignedObjects: string[];
  evaluationStatus: string;
  preparationFailure: string | null;
  acknowledgement:
    | "normal"
    | "evaluation-sid"
    | "submit-status"
    | "user-sid"
    | "assignment-object";
  onEvaluation: (() => Promise<void>) | null;
  onBrandFetch: (() => Promise<void>) | null;
  duplicateOwnedResources: boolean;
  pagedAssignments: boolean;
  request: ReturnType<typeof vi.spyOn<RequestClient, "request">>;
  brandExists: boolean;
  commitThenLoseResponse: string | null;
};
const provider: ProviderState = {
  brandStatus: "APPROVED",
  campaignStatus: "IN_PROGRESS",
  existingCampaign: false,
  omitCampaignSid: false,
  failOperation: null,
  productExists: true,
  userExists: true,
  productStatus: "twilio-approved",
  providerAttributes: { company_type: "private" },
  assignedObjects: [endUserSid, profileSid],
  evaluationStatus: "compliant",
  preparationFailure: null,
  acknowledgement: "normal",
  onEvaluation: null,
  onBrandFetch: null,
  duplicateOwnedResources: false,
  pagedAssignments: false,
  request: vi.spyOn(new RequestClient(), "request"),
  brandExists: true,
  commitThenLoseResponse: null,
};

function stored() {
  return getWorkspaceMessagingOnboardingFromTwilioData(state.twilioData);
}
function seed(
  options: { brand?: boolean; campaign?: boolean; staleError?: boolean } = {},
) {
  provider.brandExists = options.brand !== false;
  state.twilioData = {
    sid: `AC${"5".repeat(32)}`,
    authToken: "fixture-token",
    untouched: "keep",
    portalSync: {
      lastSyncStatus: "healthy",
      tollFreeVerificationBlocked: false,
      tollFreeVerificationCheckedAt: "2026-10-03T10:00:00Z",
    },
    onboarding: onboardingFixture({
      operatingCountry: "US",
      selectedChannels: ["a2p10dlc"],
      messagingService: { ...onboardingFixture().messagingService, serviceSid },
      businessProfile: {
        ...onboardingFixture().businessProfile,
        legalBusinessName: "Acme Health",
        a2pCompanyType: "private",
        websiteUrl: "https://acme.test",
        supportEmail: "support@acme.test",
        useCaseSummary: description,
        optInWorkflow: flow,
        sampleMessages: samples,
      },
      a2p10dlc: {
        ...onboardingFixture().a2p10dlc,
        customerProfileBundleSid: profileSid,
        trustProductSid: productSid,
        brandSid: options.brand === false ? null : brandSid,
        campaignSid: options.campaign ? campaignSid : null,
        status: options.staleError ? "rejected" : "approved",
        rejectionReason: options.staleError ? "Old campaign failure" : null,
      },
      reviewState: {
        blockingIssues: [],
        lastError: options.staleError ? "Old provider error" : null,
        lastUpdatedAt: null,
      },
    }),
  };
  invalidateWorkspaceTwilioData("w1");
}
type SdkRequest = Parameters<RequestClient["request"]>[0];
function listResponse(results: unknown[], key = "results") {
  return { [key]: results, meta: { key, next_page_url: null } };
}
function productRecord() {
  return {
    sid: productSid,
    policy_sid: policySid,
    status: provider.productStatus,
    friendly_name: "CallCaster w1 A2P Messaging Profile",
  };
}
function userRecord() {
  return {
    sid: provider.acknowledgement === "user-sid" ? undefined : endUserSid,
    type: "us_a2p_messaging_profile_information",
    attributes: provider.providerAttributes,
    friendly_name: "CallCaster w1 A2P Messaging Profile EndUser",
  };
}
function campaignResponse(input: SdkRequest) {
  const campaign = {
    sid: campaignSid,
    brand_registration_sid: brandSid,
    campaign_status: provider.campaignStatus,
  };
  if (input.method.toUpperCase() === "POST")
    return {
      ...campaign,
      sid: provider.omitCampaignSid ? undefined : campaignSid,
    };
  return input.uri.endsWith(`/${campaignSid}`)
    ? campaign
    : listResponse(
        provider.existingCampaign ? [campaign] : [],
        "us_app_to_person",
      );
}
async function brandResponse(input: SdkRequest) {
  if (input.method.toUpperCase() === "GET") await provider.onBrandFetch?.();
  if (input.method.toUpperCase() === "POST") provider.brandExists = true;
  const brand = {
    sid: brandSid,
    status: provider.brandStatus,
    customer_profile_bundle_sid: profileSid,
    a2p_profile_bundle_sid: productSid,
    failure_reason:
      provider.brandStatus === "FAILED" ? "Business identity mismatch" : null,
  };
  return input.method.toUpperCase() === "GET" &&
    input.uri.endsWith("/BrandRegistrations")
    ? listResponse(provider.brandExists ? [brand] : [], "data")
    : brand;
}
function userResponse(input: SdkRequest) {
  if (input.method.toUpperCase() === "POST") {
    provider.userExists = true;
    provider.providerAttributes = JSON.parse(String(input.data?.Attributes));
    return userRecord();
  }
  if (!new URL(input.uri).pathname.endsWith("/EndUsers")) return userRecord();
  const users = provider.userExists ? [userRecord()] : [];
  if (provider.userExists && provider.duplicateOwnedResources)
    users.push({ ...userRecord(), sid: "ITduplicate" });
  return listResponse(users);
}
function assignmentResponse(input: SdkRequest) {
  if (input.method.toUpperCase() === "POST") {
    const object = String(input.data?.ObjectSid);
    provider.assignedObjects.push(object);
    return {
      sid: "BV123",
      object_sid:
        provider.acknowledgement === "assignment-object" ? "BUwrong" : object,
    };
  }
  if (provider.pagedAssignments && !input.uri.includes("PageToken"))
    return {
      results: [{ sid: "BVfirst", object_sid: profileSid }],
      meta: { key: "results", next_page_url: `${input.uri}?PageToken=second` },
    };
  return listResponse(
    provider.assignedObjects.map((object_sid, index) => ({
      sid: `BV${index}`,
      object_sid,
    })),
  );
}
function productResponse(input: SdkRequest) {
  const isCollection = new URL(input.uri).pathname.endsWith("/TrustProducts");
  if (input.method.toUpperCase() === "POST") {
    provider.productExists = true;
    provider.productStatus = isCollection
      ? "draft"
      : provider.acknowledgement === "submit-status"
        ? "draft"
        : String(input.data?.Status);
    return productRecord();
  }
  if (!isCollection) return productRecord();
  const products = provider.productExists ? [productRecord()] : [];
  if (provider.productExists && provider.duplicateOwnedResources)
    products.push({ ...productRecord(), sid: "BUduplicate" });
  return listResponse(products);
}
async function providerResponse(input: SdkRequest) {
  const path = new URL(input.uri).pathname;
  if (path.includes("/Compliance/Usa2p")) return campaignResponse(input);
  if (path.includes("/BrandRegistrations")) return brandResponse(input);
  if (path.includes("/EndUsers")) return userResponse(input);
  if (path.endsWith("/EntityAssignments")) return assignmentResponse(input);
  if (path.endsWith("/Evaluations")) {
    await provider.onEvaluation?.();
    return {
      sid: provider.acknowledgement === "evaluation-sid" ? undefined : "EL123",
      trust_product_sid: productSid,
      policy_sid: policySid,
      status: provider.evaluationStatus,
      results: [],
    };
  }
  if (path.includes("/TrustProducts")) return productResponse(input);
  throw new Error(`Unexpected SDK request: ${input.method} ${input.uri}`);
}
function definiteFailure(input: SdkRequest): string | null {
  const method = input.method.toUpperCase(),
    path = new URL(input.uri).pathname;
  if (
    provider.preparationFailure ===
    `${method} ${path.split("/").slice(-2).join("/")}`
  )
    return "Preparation operation rejected";
  const campaign = path.includes("/Compliance/Usa2p");
  if (
    (campaign && method === "POST" && provider.failOperation === "create") ||
    (campaign && method === "GET" && provider.failOperation === "list") ||
    (path.includes("/BrandRegistrations") && provider.failOperation === "brand")
  )
    return "Provider rejected this A2P operation";
  return null;
}
function installProvider() {
  const transport = new RequestClient();
  provider.request = vi
    .spyOn(transport, "request")
    .mockImplementation(async (input) => {
      const failure = definiteFailure(input);
      if (failure)
        return {
          statusCode: 400,
          headers: {},
          body: JSON.stringify({ code: 21610, message: failure }),
        };
      const body = await providerResponse(input);
      if (
        provider.commitThenLoseResponse &&
        input.method.toUpperCase() === "POST" &&
        new URL(input.uri).pathname.endsWith(provider.commitThenLoseResponse)
      ) {
        provider.commitThenLoseResponse = null;
        return {
          statusCode: 500,
          headers: {},
          body: JSON.stringify({
            code: 20500,
            message: "Committed provider write; response lost",
          }),
        };
      }
      return {
        statusCode: input.method.toUpperCase() === "POST" ? 201 : 200,
        headers: {},
        body: JSON.stringify(body),
      };
    });
  sdk = new Twilio(`AC${"5".repeat(32)}`, "fixture-token", {
    httpClient: transport,
  });
}

function campaignCreates() {
  return provider.request.mock.calls
    .map(([input]) => input)
    .filter(
      (input) =>
        input.method.toUpperCase() === "POST" &&
        input.uri.endsWith(`/Services/${serviceSid}/Compliance/Usa2p`),
    );
}

function profileRequests(method: string, resource: string) {
  return provider.request.mock.calls
    .map(([input]) => input)
    .filter(
      (input) =>
        input.method.toUpperCase() === method &&
        new URL(input.uri).pathname.endsWith(resource),
    );
}
async function startNewProfile(
  company: "private" | "public" | "government" | "non-profit" = "private",
) {
  seed({ brand: false });
  provider.productExists = false;
  provider.userExists = false;
  provider.productStatus = "draft";
  provider.assignedObjects = [];
  await updateWorkspaceMessagingOnboardingState({
    ...args,
    updates: {
      businessProfile: {
        ...stored().businessProfile,
        a2pCompanyType: company,
        a2pStockExchange: "NASDAQ",
        a2pStockTicker: "ACME",
        a2pBrandContactEmail: "jordan@acme.test",
      },
      a2p10dlc: { trustProductSid: null, messagingProfileEndUserSid: null },
    },
  });
}

function resetFixture(
  options: {
    missingBrand?: boolean;
    brandStatus?: string;
    campaignStatus?: string;
    existingCampaign?: boolean;
  } = {},
) {
  vi.clearAllMocks();
  Object.assign(provider, {
    brandStatus: options.brandStatus ?? "APPROVED",
    campaignStatus: options.campaignStatus ?? "IN_PROGRESS",
    existingCampaign: options.existingCampaign ?? false,
    omitCampaignSid: false,
    failOperation: null,
    productExists: true,
    userExists: true,
    productStatus: "twilio-approved",
    providerAttributes: { company_type: "private" },
    assignedObjects: [endUserSid, profileSid],
    evaluationStatus: "compliant",
    preparationFailure: null,
    acknowledgement: "normal",
    onEvaluation: null,
    onBrandFetch: null,
    duplicateOwnedResources: false,
    pagedAssignments: false,
    brandExists: !options.missingBrand,
    commitThenLoseResponse: null,
  });
  state.failSidWrite = null;
  state.afterReadyWrite = null;
  state.beforeLockedRead = null;
  boundaries.bootstrap.mockResolvedValue({ outcome: "success", serviceSid });
  seed({ brand: !options.missingBrand });
  installProvider();
}
export {
  provider,
  state,
  boundaries,
  resetFixture,
  seed,
  stored,
  campaignCreates,
  profileRequests,
  startNewProfile,
  args,
  profileSid,
  productSid,
  brandSid,
  campaignSid,
  serviceSid,
  endUserSid,
  policySid,
  description,
  flow,
  samples,
};
