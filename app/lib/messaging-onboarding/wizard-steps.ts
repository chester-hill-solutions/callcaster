/**
 * Non-`.server.ts` module: wizard step identifiers shared by client UI and server.
 * Client components import wizard step metadata from here (not the `.server.ts` barrel).
 */

export const WIZARD_ONBOARDING_STEP_IDS = [
  "business_profile",
  "path_selection",
  "audience",
  "first_number",
  "script",
  "campaign_info",
  "credits",
  "launch_checks",
] as const;

export type WizardOnboardingStepId = (typeof WIZARD_ONBOARDING_STEP_IDS)[number];

/** Legacy step ids that still appear in persisted state or deep links. */
export const LEGACY_WIZARD_STEP_REDIRECTS: Record<string, WizardOnboardingStepId> = {
  use_case: "business_profile",
  provider_provisioning: "launch_checks",
};

export function isWizardOnboardingStepId(value: string): value is WizardOnboardingStepId {
  return (WIZARD_ONBOARDING_STEP_IDS as readonly string[]).includes(value);
}

export function resolvePersistedWizardStep(
  currentStep: string | null | undefined,
): WizardOnboardingStepId {
  if (!currentStep) return "business_profile";
  if (isWizardOnboardingStepId(currentStep)) return currentStep;
  const redirected = LEGACY_WIZARD_STEP_REDIRECTS[currentStep];
  if (redirected) return redirected;
  return "business_profile";
}
