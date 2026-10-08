import { describe, expect, test } from "vitest";
import { onboardingFixture } from "./fixtures/onboarding";
import {
  getA2pMessagingProfileAttributes,
  validatePostedA2pProfileFields,
  validateProviderA2pProfileAttributes,
} from "@/lib/a2p-messaging-profile.server";
import {
  normalizeWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { readChannelInlineBusinessFields } from "@/lib/onboarding-actions.server";

describe("explicit A2P business data (#2282)", () => {
  test("old unrelated business type is not a company classification or preparation proof", () => {
    const state = normalizeWorkspaceMessagingOnboardingState({
      businessProfile: { businessType: "public" },
      a2p10dlc: { status: "approved", trustProductSid: "BUold" },
    });
    expect(state.businessProfile.a2pCompanyType).toBeNull();
    expect(state.a2p10dlc.messagingProfileStatus).toBe("not_started");
    expect(state.a2p10dlc.messagingProfileEndUserSid).toBeNull();
    expect(getA2pMessagingProfileAttributes(state.businessProfile).ok).toBe(
      false,
    );
  });
  test.each(["Public", "publicly traded", " private ", "corporation"])(
    "unsupported company %s does not become a provider selection",
    (company) => {
      const form = new FormData();
      form.set("a2pCompanyType", company);
      expect(validatePostedA2pProfileFields(form)).toContain(
        "valid A2P company type",
      );
    },
  );
  test.each(["nasdaq", "New York Stock Exchange", "invalid"])(
    "unsupported exchange %s is rejected before save",
    (exchange) => {
      const form = new FormData();
      form.set("a2pStockExchange", exchange);
      expect(validatePostedA2pProfileFields(form)).toContain(
        "valid public company stock exchange",
      );
    },
  );
  test("public profile trims user text and keeps the exact exchange code", () => {
    const profile = {
      ...onboardingFixture().businessProfile,
      a2pCompanyType: "public" as const,
      a2pStockExchange: "TSX" as const,
      a2pStockTicker: " ACME ",
      a2pBrandContactEmail: " representative@acme.example ",
    };
    expect(getA2pMessagingProfileAttributes(profile)).toEqual({
      ok: true,
      attributes: {
        company_type: "public",
        stock_exchange: "TSX",
        stock_ticker: "ACME",
        brand_contact_email: "representative@acme.example",
      },
    });
    expect(
      validateProviderA2pProfileAttributes({
        company_type: "public",
        stock_exchange: "TSX",
        stock_ticker: "ACME",
      }),
    ).toBe(false);
    expect(
      validateProviderA2pProfileAttributes({
        company_type: "public",
        stock_exchange: "TSX",
        stock_ticker: "ACME",
        brand_contact_email: "representative@acme.example",
      }),
    ).toBe(true);
  });
  test("unrelated partial form saves retain company, exchange, ticker and contact", () => {
    const current = {
      ...onboardingFixture().businessProfile,
      a2pCompanyType: "public" as const,
      a2pStockExchange: "NYSE" as const,
      a2pStockTicker: "ACME",
      a2pBrandContactEmail: "jordan@acme.example",
    };
    const form = new FormData();
    form.set("industry", "Healthcare");
    expect(readChannelInlineBusinessFields(form, current)).toMatchObject({
      a2pCompanyType: "public",
      a2pStockExchange: "NYSE",
      a2pStockTicker: "ACME",
      a2pBrandContactEmail: "jordan@acme.example",
      industry: "Healthcare",
    });
  });
  test("an explicit empty company clears the value without inventing another classification", () => {
    const current = {
      ...onboardingFixture().businessProfile,
      a2pCompanyType: "private" as const,
    };
    const form = new FormData();
    form.set("a2pCompanyType", "");
    expect(
      readChannelInlineBusinessFields(form, current).a2pCompanyType,
    ).toBeNull();
  });
  test.each([
    "a2pCompanyType",
    "a2pStockExchange",
    "a2pStockTicker",
    "a2pBrandContactEmail",
  ] as const)(
    "changing %s invalidates preparation but retains provider resources",
    (field) => {
      const current = onboardingFixture({
        businessProfile: {
          ...onboardingFixture().businessProfile,
          a2pCompanyType: "public",
          a2pStockExchange: "NASDAQ",
          a2pStockTicker: "OLD",
          a2pBrandContactEmail: "jordan@acme.example",
        },
        a2p10dlc: {
          ...onboardingFixture().a2p10dlc,
          trustProductSid: "BUprofile",
          messagingProfileEndUserSid: "ITenduser",
          messagingProfileStatus: "ready",
          brandSid: "BNbrand",
          campaignSid: "QEcampaign",
          status: "approved",
        },
      });
      const changes = {
        a2pCompanyType: "private",
        a2pStockExchange: "NYSE",
        a2pStockTicker: "NEW",
        a2pBrandContactEmail: "other@acme.example",
      };
      const next = mergeWorkspaceMessagingOnboardingState(current, {
        businessProfile: {
          ...current.businessProfile,
          [field]: changes[field],
        },
      });
      expect(next.a2p10dlc).toMatchObject({
        messagingProfileStatus: "not_started",
        trustProductSid: "BUprofile",
        messagingProfileEndUserSid: "ITenduser",
        brandSid: "BNbrand",
        campaignSid: "QEcampaign",
      });
    },
  );
});
