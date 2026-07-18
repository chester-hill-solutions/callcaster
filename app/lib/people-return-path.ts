export function validatePeopleReturnPath(
  value: string | null | undefined,
  workspaceId: string,
): string | null {
  if (!value || value.includes("\\") || value.includes("//")) return null;

  const campaignRoot = `/workspaces/${workspaceId}/campaigns/`;
  return value.startsWith(campaignRoot) ? value : null;
}
