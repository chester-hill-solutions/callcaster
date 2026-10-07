import type { WorkspaceMessagingBusinessProfile } from "@/lib/types";

/**
 * The empty messaging business profile — the starting shape every onboarding
 * form builds from. Shared by the onboarding actions and the default
 * onboarding state so the field list lives in one place.
 */
export const EMPTY_BUSINESS_PROFILE: WorkspaceMessagingBusinessProfile = {
  legalBusinessName: "",
  businessType: "",
  websiteUrl: "",
  privacyPolicyUrl: "",
  termsOfServiceUrl: "",
  supportEmail: "",
  supportPhone: "",
  useCaseSummary: "",
  optInWorkflow: "",
  tollFreeOptInType: null,
  optInKeywords: "",
  optOutKeywords: "",
  helpKeywords: "",
  sampleMessages: [],
  doingBusinessAs: "",
  businessRegistrationNumber: "",
  ageGatedContent: false,
  a2pCompanyType: null,
  a2pStockExchange: null,
  a2pStockTicker: "",
  a2pBrandContactEmail: "",
  ein: "",
  industry: "",
  authorizedRepName: "",
  authorizedRepEmail: "",
  authorizedRepPhone: "",
  authorizedRepTitle: "",
};
