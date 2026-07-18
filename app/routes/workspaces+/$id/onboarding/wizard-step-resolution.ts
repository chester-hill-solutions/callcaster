import {
  isWizardOnboardingStepId,
  LEGACY_WIZARD_STEP_REDIRECTS,
  resolvePersistedWizardStep,
  type WizardOnboardingStepId,
} from "@/lib/messaging-onboarding/wizard-steps";

/**
 * Resolve the active wizard step from the URL, falling back to the persisted
 * step. Shared by the wizard body and the route-chrome progress strip so both
 * always agree on which step is active.
 */
export function readWizardStep(
  urlStep: string | null,
  currentStep: string | null | undefined,
  visibleSteps: WizardOnboardingStepId[],
): WizardOnboardingStepId {
  const resolvedUrl =
    urlStep && LEGACY_WIZARD_STEP_REDIRECTS[urlStep]
      ? LEGACY_WIZARD_STEP_REDIRECTS[urlStep]
      : urlStep;
  if (
    resolvedUrl &&
    isWizardOnboardingStepId(resolvedUrl) &&
    visibleSteps.includes(resolvedUrl)
  ) {
    return resolvedUrl;
  }
  const persisted = resolvePersistedWizardStep(currentStep);
  if (visibleSteps.includes(persisted)) {
    return persisted;
  }
  return visibleSteps[0] ?? "business_identity";
}
