export function validatePeopleReturnPath(
  value: string | null | undefined,
  workspaceId: string,
): string | null {
  if (!value || value.includes("\\") || value.includes("//")) return null;

  const campaignRoot = `/workspaces/${workspaceId}/campaigns/`;
  const onboardingRoot = `/workspaces/${workspaceId}/onboarding`;
  if (value.startsWith(campaignRoot)) return value;
  if (value === onboardingRoot || value.startsWith(`${onboardingRoot}?`)) {
    return value;
  }
  return null;
}
