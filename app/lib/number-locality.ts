/**
 * Twilio's Available Phone Numbers API reports a rate centre as `locality`.
 * Canadian rate centres that cover two towns come back as one run-together
 * word. Some keep the inner capital ("AjaxPickering"); the ones Twilio
 * title-cases lose it ("Ajaxpickering"), so no boundary survives to split on.
 * Those are listed here by hand, verified against the live search results.
 */
const KNOWN_RATE_CENTRE_NAMES: Record<string, string> = {
  ajaxpickering: "Ajax-Pickering",
};

export function formatNumberLocality(locality: string | null | undefined): string {
  if (!locality) return "";
  const trimmed = locality.trim();
  const known = KNOWN_RATE_CENTRE_NAMES[trimmed.toLowerCase()];
  if (known) return known;
  return trimmed.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatNumberLocation(
  locality: string | null | undefined,
  region: string | null | undefined,
): string {
  const parts = [formatNumberLocality(locality), region?.trim()].filter(Boolean);
  return parts.join(", ");
}
