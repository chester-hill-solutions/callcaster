/**
 * Non-`.server.ts` module: wizard step identifiers shared by client UI and server.
 * Client components import wizard step metadata from here (not the `.server.ts` barrel).
 */

export const WIZARD_ONBOARDING_STEP_IDS = [
  "business_profile",
  "path_selection",
  "messaging_service",
  "first_number",
  "provider_provisioning",
  "launch_checks",
] as const;

export type WizardOnboardingStepId = (typeof WIZARD_ONBOARDING_STEP_IDS)[number];

export function isWizardOnboardingStepId(value: string): value is WizardOnboardingStepId {
  return (WIZARD_ONBOARDING_STEP_IDS as readonly string[]).includes(value);
}
