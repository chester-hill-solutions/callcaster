import { createHash } from "node:crypto";

export const SEED_VERSION = "e2e-v1";
export const E2E_PASSWORD = "E2eTestPass1!";

export const USERS = {
  owner: { id: "b1000000-0000-4000-8000-000000000001", email: "owner@e2e.test", first: "E2E", last: "Owner" },
  admin: { id: "b1000000-0000-4000-8000-000000000002", email: "admin@e2e.test", first: "E2E", last: "Admin" },
  member: { id: "b1000000-0000-4000-8000-000000000003", email: "member@e2e.test", first: "E2E", last: "Member" },
  caller: { id: "b1000000-0000-4000-8000-000000000004", email: "caller@e2e.test", first: "E2E", last: "Caller" },
  sudo: { id: "b1000000-0000-4000-8000-000000000005", email: "sudo@e2e.test", first: "E2E", last: "Sudo" },
  invitee: { id: "b1000000-0000-4000-8000-000000000006", email: "invitee@e2e.test", first: "E2E", last: "Invitee" },
};

export const WORKSPACES = {
  ready: { id: "a0000000-0000-4000-8000-000000000001", name: "E2E Ready Workspace" },
  onboarding: { id: "a0000000-0000-4000-8000-000000000002", name: "E2E Onboarding Workspace" },
  empty: { id: "a0000000-0000-4000-8000-000000000003", name: "E2E Empty Workspace" },
};

export const CAMPAIGNS = {
  liveCall: 910001,
  livePredictive: 910002,
  message: 910003,
  robocall: 910004,
  archived: 910005,
};

export const AUDIENCE_ID = 920001;
export const CONTACT_IDS = [930001, 930002, 930003];
export const WORKSPACE_NUMBER_ID = 940001;
export const SCRIPT_IDS = { live: 950001, ivr: 950002 };
export const SURVEY = { id: 960001, publicId: "e2e-survey-public", pageId: 960101 };
export const API_KEY = {
  id: "c1000000-0000-4000-8000-000000000001",
  plaintext: "cc_e2e_test_key_for_api_calls_only",
  prefix: "cc_e2e_tes",
};

export const ALL_DAY_SCHEDULE = {
  sunday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] },
  monday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] },
  tuesday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] },
  wednesday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] },
  thursday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] },
  friday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] },
  saturday: { active: true, intervals: [{ start: "00:00", end: "23:59" }] },
};

export function readyTwilioData() {
  return {
    sid: "AC_e2e_test",
    authToken: "e2e_auth_token",
    onboarding: {
      version: 2,
      status: "in_progress",
      currentStep: "launch_checks",
      selectedChannels: ["a2p10dlc"],
      businessProfile: {
        legalBusinessName: "E2E Corp",
        businessType: "llc",
        websiteUrl: "https://e2e.test",
        privacyPolicyUrl: "https://e2e.test/privacy",
        termsOfServiceUrl: "https://e2e.test/terms",
        supportEmail: "support@e2e.test",
        supportPhone: "+15555501000",
        useCaseSummary: "E2E testing",
        optInWorkflow: "web",
        optInKeywords: "START",
        optOutKeywords: "STOP",
        helpKeywords: "HELP",
        sampleMessages: ["Hello from E2E"],
      },
      messagingService: {
        desiredSendMode: "messaging_service",
        serviceSid: "MG_e2e_test_service",
        friendlyName: "E2E Messaging",
        provisioningStatus: "live",
        attachedSenderPhoneNumbers: ["+15555501001"],
        supportedChannels: ["sms"],
        stickySenderEnabled: true,
        advancedOptOutEnabled: true,
        lastProvisionedAt: new Date().toISOString(),
        lastError: null,
      },
      emergencyVoice: {
        enabled: false,
        emergencyEligiblePhoneNumbers: [],
        address: { status: "not_started", countryCode: "CA" },
      },
      a2p10dlc: { status: "approved" },
      rcs: { status: "not_started" },
      subaccountBootstrap: { status: "complete" },
    },
  };
}

export function hashApiKey(key) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}
