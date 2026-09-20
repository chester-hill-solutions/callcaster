import type { WorkspaceMessagingBusinessProfile } from "@/lib/types";

/**
 * The empty messaging business profile — the starting shape every onboarding
 * form builds from (#1892). Shared by the onboarding actions and the default
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
  optInKeywords: "",
  optOutKeywords: "",
  helpKeywords: "",
  sampleMessages: [],
  doingBusinessAs: "",
  businessRegistrationNumber: "",
  ageGatedContent: false,
  ein: "",
  industry: "",
  authorizedRepName: "",
  authorizedRepEmail: "",
  authorizedRepPhone: "",
  authorizedRepTitle: "",
};