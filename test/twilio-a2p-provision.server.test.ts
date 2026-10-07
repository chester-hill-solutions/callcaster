import { beforeEach, describe, expect, test } from "vitest";
import {
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
  description,
  flow,
  samples,
} from "./fixtures/a2p-profile-provider";
import { provisionA2pRegistration } from "@/lib/twilio-a2p-provision.server";
import { runWorkspaceTwilioComplianceJob } from "@/lib/twilio-compliance-job.server";
import { assertWorkspaceCanSendSms } from "@/lib/twilio-readiness.server";
import { syncWorkspaceA2pStatus } from "@/lib/twilio-a2p-status-sync.server";
import { updateWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { invalidateWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
describe("canonical A2P chain through installed SDK and actual stored state", () => {
  beforeEach(() => {
    resetFixture();
  });

  test.each([
    "legalBusinessName",
    "websiteUrl",
    "useCaseSummary",
    "optInWorkflow",
  ] as const)(
    "missing %s stops provisioning before provider calls",
    async (field) => {
      const current = stored();
      state.twilioData.onboarding = {
        ...current,
        businessProfile: { ...current.businessProfile, [field]: "" },
      };
      invalidateWorkspaceTwilioData("w1");
      await runWorkspaceTwilioComplianceJob(args);
      expect(stored().a2p10dlc.status).toBe("rejected");
      expect(stored().reviewState.blockingIssues.length).toBeGreaterThan(0);
      expect(provider.request).not.toHaveBeenCalled();
    },
  );

  test("creates and stores a service-scoped campaign with the provider payload", async () => {
    const result = await provisionA2pRegistration(args);
    expect(campaignCreates()).toHaveLength(1);
    expect(campaignCreates()[0].data).toMatchObject({
      BrandRegistrationSid: brandSid,
      Description: description,
      MessageFlow: flow,
      MessageSamples: samples,
      UsAppToPersonUsecase: "LOW_VOLUME",
      HasEmbeddedLinks: "false",
      HasEmbeddedPhone: "false",
    });
    expect(result).toMatchObject({
      status: "in_review",
      details: { campaignSid },
    });
    expect(stored().a2p10dlc.campaignSid).toBe(campaignSid);
    expect(state.twilioData.untouched).toBe("keep");
  });
  test("creates the brand, waits for approval and then resumes campaign creation", async () => {
    seed({ brand: false });
    provider.brandStatus = "PENDING";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({
      brandSid,
      campaignSid: null,
      status: "in_review",
    });
    expect(campaignCreates()).toHaveLength(0);
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
      "not approved",
    );
    provider.brandStatus = "APPROVED";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.campaignSid).toBe(campaignSid);
    expect(campaignCreates()).toHaveLength(1);
    expect(
      provider.request.mock.calls.filter(
        ([input]) =>
          input.method.toUpperCase() === "POST" &&
          input.uri.endsWith("/BrandRegistrations"),
      ),
    ).toHaveLength(1);
  });
  test("reuses and stores an existing provider campaign without a duplicate", async () => {
    provider.existingCampaign = true;
    await provisionA2pRegistration(args);
    expect(campaignCreates()).toHaveLength(0);
    expect(stored().a2p10dlc.campaignSid).toBe(campaignSid);
  });
  test.each(["create", "list", "brand"] as const)(
    "worker records %s failure and removes stale approval",
    async (operation) => {
      provider.failOperation = operation;
      await runWorkspaceTwilioComplianceJob(args);
      expect(stored().a2p10dlc.status).toBe("rejected");
      expect(stored().reviewState.lastError).toContain("Provider rejected");
      expect(stored().a2p10dlc.brandSid).toBe(brandSid);
      await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
        "not approved",
      );
      expect(boundaries.alert).toHaveBeenCalled();
      if (operation !== "create") expect(campaignCreates()).toHaveLength(0);
    },
  );
  test("missing campaign SID cannot become a successful review result", async () => {
    provider.omitCampaignSid = true;
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({
      campaignSid: null,
      status: "rejected",
    });
    expect(stored().reviewState.lastError).toContain(
      "Campaign SID was not returned",
    );
  });
  test("successful retry clears stale errors and keeps reusable IDs", async () => {
    seed({ staleError: true });
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({
      brandSid,
      campaignSid,
      status: "in_review",
      rejectionReason: null,
    });
    expect(stored().reviewState).toMatchObject({
      lastError: null,
      blockingIssues: [],
    });
  });
  test("both approved resources permit sending through the stored gate", async () => {
    seed({ campaign: true });
    provider.existingCampaign = true;
    provider.campaignStatus = "VERIFIED";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("approved");
    await expect(assertWorkspaceCanSendSms(args)).resolves.toBeUndefined();
    expect(campaignCreates()).toHaveLength(0);
  });
  test("brand rejection stays visible and does not create a campaign", async () => {
    provider.brandStatus = "FAILED";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    expect(stored().reviewState.blockingIssues).toContain(
      "Business identity mismatch",
    );
    expect(campaignCreates()).toHaveLength(0);
  });
  test("thrown bootstrap failure records an error and removes stale approval", async () => {
    seed({ campaign: true });
    boundaries.bootstrap.mockRejectedValue(
      new Error("Workspace Twilio credentials are missing"),
    );
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    expect(stored().reviewState.lastError).toContain(
      "Twilio credentials are missing",
    );
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
      "not approved",
    );
    expect(provider.request).not.toHaveBeenCalled();
  });
  test("a retry after campaign failure preserves the brand without creating it again", async () => {
    seed({ brand: false });
    provider.failOperation = "create";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({
      brandSid,
      campaignSid: null,
      status: "rejected",
    });
    provider.failOperation = null;
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({
      brandSid,
      campaignSid,
      status: "in_review",
      rejectionReason: null,
    });
    expect(stored().reviewState.lastError).toBeNull();
    expect(
      provider.request.mock.calls.filter(
        ([input]) =>
          input.method.toUpperCase() === "POST" &&
          input.uri.endsWith("/BrandRegistrations"),
      ),
    ).toHaveLength(1);
  });
  test("missing sample messages stop the worker before provider calls", async () => {
    const current = stored();
    state.twilioData.onboarding = {
      ...current,
      businessProfile: { ...current.businessProfile, sampleMessages: [] },
    };
    invalidateWorkspaceTwilioData("w1");
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    expect(provider.request).not.toHaveBeenCalled();
  });

  test("bootstrap failure removes an older completed A2P approval", async () => {
    seed({ campaign: true });
    boundaries.bootstrap.mockResolvedValue({
      outcome: "failed",
      serviceSid: null,
      lastError: "Bootstrap failed",
    });
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.status).toBe("rejected");
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
      "not approved",
    );
    expect(provider.request).not.toHaveBeenCalled();
  });
  test.each([
    { brandSid: null, campaignSid },
    { brandSid, campaignSid: null },
  ])(
    "stale approval with missing resource cannot permit sends: %j",
    async (ids) => {
      const current = stored();
      state.twilioData.onboarding = {
        ...current,
        a2p10dlc: { ...current.a2p10dlc, ...ids },
      };
      invalidateWorkspaceTwilioData("w1");
      await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
        "not approved",
      );
    },
  );
});

describe("Messaging Profile preparation before brand registration (#2282)", () => {
  beforeEach(() => {
    resetFixture({ missingBrand: true, brandStatus: "PENDING" });
  });
  test.each(["private", "government", "non-profit"] as const)(
    "creates complete %s profile before the brand and omits public fields",
    async (company) => {
      await startNewProfile(company);
      await runWorkspaceTwilioComplianceJob(args);
      const creates = profileRequests("POST", "/EndUsers");
      expect(creates).toHaveLength(1);
      expect(creates[0].data).toMatchObject({
        Type: "us_a2p_messaging_profile_information",
      });
      expect(JSON.parse(String(creates[0].data?.Attributes))).toEqual({
        company_type: company,
      });
      expect(
        profileRequests("POST", "/EntityAssignments").map(
          (input) => input.data?.ObjectSid,
        ),
      ).toEqual([endUserSid, profileSid]);
      const operations = provider.request.mock.calls
        .map(([input]) => input)
        .filter((input) => input.method.toUpperCase() === "POST")
        .map((input) => new URL(input.uri).pathname.split("/").at(-1));
      expect(operations.indexOf("EndUsers")).toBeLessThan(
        operations.indexOf("EntityAssignments"),
      );
      expect(operations.lastIndexOf("EntityAssignments")).toBeLessThan(
        operations.indexOf("Evaluations"),
      );
      expect(operations.indexOf("Evaluations")).toBeLessThan(
        operations.lastIndexOf(productSid),
      );
      expect(operations.lastIndexOf(productSid)).toBeLessThan(
        operations.indexOf("BrandRegistrations"),
      );
      expect(profileRequests("POST", `/${productSid}`)[0].data?.Status).toBe(
        "pending-review",
      );
      expect(stored().a2p10dlc).toMatchObject({
        trustProductSid: productSid,
        messagingProfileEndUserSid: endUserSid,
        messagingProfileStatus: "ready",
        brandSid,
        status: "in_review",
      });
    },
  );
  test("public company sends stock and representative email on EndUser, not BrandRegistration", async () => {
    await startNewProfile("public");
    await runWorkspaceTwilioComplianceJob(args);
    expect(
      JSON.parse(
        String(profileRequests("POST", "/EndUsers")[0].data?.Attributes),
      ),
    ).toEqual({
      company_type: "public",
      stock_exchange: "NASDAQ",
      stock_ticker: "ACME",
      brand_contact_email: "jordan@acme.test",
    });
    const brand = profileRequests("POST", "/BrandRegistrations")[0];
    expect(brand.data).toMatchObject({
      CustomerProfileBundleSid: profileSid,
      A2PProfileBundleSid: productSid,
    });
    expect(brand.data).not.toHaveProperty("BrandContactEmail");
    expect(stored().a2p10dlc.messagingProfileStatus).toBe("ready");
  });
  test.each([
    "a2pCompanyType",
    "a2pStockExchange",
    "a2pStockTicker",
    "a2pBrandContactEmail",
  ] as const)(
    "missing public %s stops all new provider resources",
    async (field) => {
      await startNewProfile("public");
      await updateWorkspaceMessagingOnboardingState({
        ...args,
        updates: {
          businessProfile: {
            ...stored().businessProfile,
            [field]:
              field === "a2pCompanyType" || field === "a2pStockExchange"
                ? null
                : "",
          },
        },
      });
      await runWorkspaceTwilioComplianceJob(args);
      expect(provider.request).not.toHaveBeenCalled();
      expect(stored().a2p10dlc.messagingProfileStatus).toBe("action_needed");
      expect(stored().reviewState.lastError).toBeTruthy();
    },
  );
  test.each(["noncompliant", "unknown", ""])(
    "evaluation %s blocks submission and brand; correction reuses all prepared resources",
    async (status) => {
      await startNewProfile();
      provider.evaluationStatus = status;
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(0);
      expect(profileRequests("POST", `/${productSid}`)).toHaveLength(0);
      expect(stored().a2p10dlc).toMatchObject({
        trustProductSid: productSid,
        messagingProfileEndUserSid: endUserSid,
        messagingProfileStatus: "action_needed",
        status: "rejected",
      });
      provider.evaluationStatus = "compliant";
      await runWorkspaceTwilioComplianceJob(args);
      expect(stored().a2p10dlc.messagingProfileStatus).toBe("ready");
      expect(profileRequests("POST", "/TrustProducts")).toHaveLength(1);
      expect(profileRequests("POST", "/EndUsers")).toHaveLength(1);
      expect(profileRequests("POST", "/EntityAssignments")).toHaveLength(2);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(1);
    },
  );
  test.each([
    "evaluation-sid",
    "submit-status",
    "user-sid",
    "assignment-object",
  ] as const)(
    "invalid %s acknowledgement never creates brand",
    async (mode) => {
      await startNewProfile();
      provider.acknowledgement = mode;
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(0);
      expect(stored().a2p10dlc.messagingProfileStatus).toBe("action_needed");
      expect(stored().a2p10dlc.status).toBe("rejected");
    },
  );
  test("submission failure retains IDs and assignment evidence for a single-resource retry", async () => {
    await startNewProfile();
    provider.preparationFailure = `POST TrustProducts/${productSid}`;
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc).toMatchObject({
      trustProductSid: productSid,
      messagingProfileEndUserSid: endUserSid,
      messagingProfileStatus: "action_needed",
    });
    expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(0);
    provider.preparationFailure = null;
    await runWorkspaceTwilioComplianceJob(args);
    expect(profileRequests("POST", "/EndUsers")).toHaveLength(1);
    expect(profileRequests("POST", "/EntityAssignments")).toHaveLength(2);
    expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(1);
    expect(stored().reviewState.lastError).toBeNull();
  });
  test.each(["pending-review", "in-review", "twilio-approved"])(
    "complete %s provider profile is reused without another submission",
    async (status) => {
      provider.productStatus = status;
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", `/${productSid}`)).toHaveLength(0);
      expect(profileRequests("POST", "/EndUsers")).toHaveLength(0);
      expect(profileRequests("POST", "/EntityAssignments")).toHaveLength(0);
      expect(stored().a2p10dlc.messagingProfileEndUserSid).toBe(endUserSid);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(1);
    },
  );
  test("existing approved profile with complete actual attributes can be read without inventing local company data", async () => {
    await updateWorkspaceMessagingOnboardingState({
      ...args,
      updates: {
        businessProfile: { ...stored().businessProfile, a2pCompanyType: null },
      },
    });
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().businessProfile.a2pCompanyType).toBeNull();
    expect(stored().a2p10dlc.messagingProfileStatus).toBe("ready");
    expect(profileRequests("POST", `/${endUserSid}`)).toHaveLength(0);
  });
  test("incomplete legacy public profile is repaired before brand reuse without duplicate EndUser", async () => {
    provider.providerAttributes = {
      company_type: "public",
      stock_exchange: "NASDAQ",
      stock_ticker: "ACME",
    };
    await updateWorkspaceMessagingOnboardingState({
      ...args,
      updates: {
        businessProfile: {
          ...stored().businessProfile,
          a2pCompanyType: "public",
          a2pStockExchange: "NASDAQ",
          a2pStockTicker: "ACME",
          a2pBrandContactEmail: "jordan@acme.test",
        },
      },
    });
    await runWorkspaceTwilioComplianceJob(args);
    expect(profileRequests("POST", "/EndUsers")).toHaveLength(0);
    expect(
      JSON.parse(
        String(profileRequests("POST", `/${endUserSid}`)[0].data?.Attributes),
      ),
    ).toMatchObject({ brand_contact_email: "jordan@acme.test" });
    expect(profileRequests("POST", "/EntityAssignments")).toHaveLength(0);
    expect(stored().a2p10dlc.messagingProfileStatus).toBe("ready");
  });
  test("unrecorded owned provider product and EndUser are recovered instead of duplicated", async () => {
    provider.assignedObjects = [];
    await updateWorkspaceMessagingOnboardingState({
      ...args,
      updates: {
        a2p10dlc: { trustProductSid: null, messagingProfileEndUserSid: null },
      },
    });
    await runWorkspaceTwilioComplianceJob(args);
    expect(profileRequests("POST", "/TrustProducts")).toHaveLength(0);
    expect(profileRequests("POST", "/EndUsers")).toHaveLength(0);
    expect(stored().a2p10dlc).toMatchObject({
      trustProductSid: productSid,
      messagingProfileEndUserSid: endUserSid,
      messagingProfileStatus: "ready",
    });
  });
  test.each([
    `GET TrustProducts/${productSid}`,
    `${productSid}/EntityAssignments`,
    `GET EndUsers/${endUserSid}`,
  ])(
    "failed lookup %s cannot create a substitute resource",
    async (operation) => {
      provider.preparationFailure = operation.includes(" ")
        ? operation
        : `GET ${operation}`;
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", "/TrustProducts")).toHaveLength(0);
      expect(profileRequests("POST", "/EndUsers")).toHaveLength(0);
      expect(profileRequests("POST", "/EntityAssignments")).toHaveLength(0);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(0);
      expect(stored().a2p10dlc.messagingProfileStatus).toBe("action_needed");
    },
  );
  test("polling approved brand and campaign cannot erase a failed preparation or allow sends", async () => {
    seed({ campaign: true });
    provider.existingCampaign = true;
    provider.brandStatus = "APPROVED";
    provider.campaignStatus = "VERIFIED";
    provider.evaluationStatus = "noncompliant";
    await runWorkspaceTwilioComplianceJob(args);
    await syncWorkspaceA2pStatus(args);
    expect(stored().a2p10dlc).toMatchObject({
      messagingProfileStatus: "action_needed",
      status: "rejected",
      brandSid,
      campaignSid,
    });
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
      "not approved",
    );
  });
  test("a concurrent business change prevents old preparation from marking the new inputs ready", async () => {
    await startNewProfile("public");
    provider.onEvaluation = async () => {
      await updateWorkspaceMessagingOnboardingState({
        ...args,
        updates: {
          businessProfile: {
            ...stored().businessProfile,
            a2pStockTicker: "NEW",
          },
        },
      });
    };
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().businessProfile.a2pStockTicker).toBe("NEW");
    expect(stored().a2p10dlc.messagingProfileStatus).toBe("action_needed");
    expect(stored().reviewState.lastError).toContain(
      "changed during preparation",
    );
    expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(0);
  });
});

describe("uncertain provider or stored preparation evidence (#2282)", () => {
  beforeEach(() => {
    resetFixture({ campaignStatus: "VERIFIED", existingCampaign: true });
  });
  test.each(["trustProductSid", "messagingProfileEndUserSid"])(
    "a failed %s write recovers the actual owned resource on retry",
    async (field) => {
      await startNewProfile();
      state.failSidWrite = field;
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(0);
      expect(stored().reviewState.lastError).toContain(
        "SID persistence failed",
      );
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", "/TrustProducts")).toHaveLength(1);
      expect(profileRequests("POST", "/EndUsers")).toHaveLength(1);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(1);
      expect(stored().a2p10dlc.messagingProfileStatus).toBe("ready");
    },
  );
  test("all assignment pages are read before deciding to create a duplicate", async () => {
    provider.pagedAssignments = true;
    await runWorkspaceTwilioComplianceJob(args);
    expect(profileRequests("POST", "/EntityAssignments")).toHaveLength(0);
    expect(
      provider.request.mock.calls.some(([input]) =>
        input.uri.includes("PageToken=second"),
      ),
    ).toBe(true);
    expect(stored().a2p10dlc.messagingProfileEndUserSid).toBe(endUserSid);
  });
  test.each(["product", "user"])(
    "ambiguous owned %s lookup requires action instead of another resource",
    async (resource) => {
      provider.duplicateOwnedResources = true;
      provider.assignedObjects = [];
      await updateWorkspaceMessagingOnboardingState({
        ...args,
        updates: {
          a2p10dlc: {
            trustProductSid: resource === "product" ? null : productSid,
            messagingProfileEndUserSid: null,
          },
        },
      });
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", "/TrustProducts")).toHaveLength(0);
      expect(profileRequests("POST", "/EndUsers")).toHaveLength(0);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(0);
      expect(stored().reviewState.lastError).toContain("Multiple owned");
    },
  );
  test.each(["", "approved", "pending_review", "new-provider-state"])(
    "unknown product state %s cannot be treated as submitted",
    async (status) => {
      provider.productStatus = status;
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(0);
      expect(stored().a2p10dlc.messagingProfileStatus).toBe("action_needed");
    },
  );
  test("a preparation failure during polling is retained by the fresh-row status update", async () => {
    seed({ campaign: true });
    await updateWorkspaceMessagingOnboardingState({
      ...args,
      updates: {
        a2p10dlc: {
          messagingProfileStatus: "ready",
          messagingProfileEndUserSid: endUserSid,
        },
      },
    });
    provider.onBrandFetch = async () => {
      await updateWorkspaceMessagingOnboardingState({
        ...args,
        updates: {
          a2p10dlc: {
            messagingProfileStatus: "action_needed",
            rejectionReason: "Messaging Profile rejected",
          },
        },
      });
    };
    await syncWorkspaceA2pStatus(args);
    expect(stored().a2p10dlc).toMatchObject({
      messagingProfileStatus: "action_needed",
      status: "rejected",
      rejectionReason: "Messaging Profile rejected",
      brandSid,
      campaignSid,
    });
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
      "not approved",
    );
  });
});

describe("lost provider responses and final preparation barriers (#2282)", () => {
  beforeEach(() => {
    resetFixture({ campaignStatus: "VERIFIED", existingCampaign: true });
  });
  test.each([
    "/TrustProducts",
    "/EndUsers",
    "/EntityAssignments",
    "/BrandRegistrations",
    `/${productSid}`,
  ])(
    "a committed %s with a lost response is recovered before another create",
    async (resource) => {
      await startNewProfile();
      provider.commitThenLoseResponse = resource;
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", resource)).toHaveLength(1);
      expect(stored().a2p10dlc.status).toBe("rejected");
      await runWorkspaceTwilioComplianceJob(args);
      expect(profileRequests("POST", "/TrustProducts")).toHaveLength(1);
      expect(profileRequests("POST", "/EndUsers")).toHaveLength(1);
      expect(profileRequests("POST", "/EntityAssignments")).toHaveLength(2);
      expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(1);
      expect(stored().a2p10dlc.messagingProfileStatus).toBe("ready");
    },
  );
  test("failed brand SID storage recovers the matching actual brand", async () => {
    await startNewProfile();
    state.failSidWrite = "brandSid";
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().a2p10dlc.brandSid).toBeNull();
    await runWorkspaceTwilioComplianceJob(args);
    expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(1);
    expect(stored().a2p10dlc.brandSid).toBe(brandSid);
  });
  test("a business edit after the ready write prevents the brand operation", async () => {
    await startNewProfile("public");
    state.afterReadyWrite = async () => {
      await updateWorkspaceMessagingOnboardingState({
        ...args,
        updates: {
          businessProfile: {
            ...stored().businessProfile,
            a2pStockTicker: "NEW",
          },
        },
      });
    };
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().businessProfile.a2pStockTicker).toBe("NEW");
    expect(stored().a2p10dlc.messagingProfileStatus).toBe("not_started");
    expect(profileRequests("POST", "/BrandRegistrations")).toHaveLength(0);
    expect(stored().reviewState.lastError).toContain(
      "changed before brand registration",
    );
  });
  test("the final worker result merges against the locked fresh row and preserves a business change", async () => {
    seed({ campaign: true });
    provider.onBrandFetch = async () => {
      state.beforeLockedRead = async () => {
        await updateWorkspaceMessagingOnboardingState({
          ...args,
          updates: {
            businessProfile: {
              ...stored().businessProfile,
              a2pCompanyType: "public",
              a2pStockTicker: "NEW",
            },
          },
        });
      };
    };
    await runWorkspaceTwilioComplianceJob(args);
    expect(stored().businessProfile).toMatchObject({
      a2pCompanyType: "public",
      a2pStockTicker: "NEW",
    });
    expect(stored().a2p10dlc).toMatchObject({
      messagingProfileStatus: "not_started",
      trustProductSid: productSid,
      messagingProfileEndUserSid: endUserSid,
      brandSid,
      campaignSid,
      status: "in_review",
    });
    await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
      "not approved",
    );
  });
  test.each(["twilio-rejected", "draft", "new-provider-state"])(
    "a later product state %s closes the actual gate despite approved brand and campaign",
    async (status) => {
      seed({ campaign: true });
      await runWorkspaceTwilioComplianceJob(args);
      await expect(assertWorkspaceCanSendSms(args)).resolves.toBeUndefined();
      provider.productStatus = status;
      await syncWorkspaceA2pStatus(args);
      expect(stored().a2p10dlc).toMatchObject({
        messagingProfileStatus: "action_needed",
        status: "rejected",
        brandSid,
        campaignSid,
      });
      expect(stored().reviewState.lastError).toContain("not accepted");
      await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
        "not approved",
      );
    },
  );
});

describe("each persisted preparation prerequisite closes the actual send gate (#2282)", () => {
  beforeEach(() => {
    resetFixture({ campaignStatus: "VERIFIED", existingCampaign: true });
  });
  test.each([
    { messagingProfileStatus: "not_started" as const },
    { messagingProfileEndUserSid: null },
    { trustProductSid: null },
  ])(
    "missing prerequisite %j blocks old aggregate approval",
    async (missing) => {
      seed({ campaign: true });
      await updateWorkspaceMessagingOnboardingState({
        ...args,
        updates: {
          a2p10dlc: {
            messagingProfileStatus: "ready",
            messagingProfileEndUserSid: endUserSid,
            ...missing,
          },
        },
      });
      await expect(assertWorkspaceCanSendSms(args)).rejects.toThrow(
        "not approved",
      );
      expect(stored().a2p10dlc.status).toBe("approved");
    },
  );
});
