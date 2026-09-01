/**
 * Interprets the JSON that `/api/campaign_audience` returns for a POST so the
 * queue page gives the user a definite answer for every 200, not only the one
 * where contacts were added. Silent 200s drove the repeat-click storm in #1472.
 */
export type AudienceLinkResponse = {
  success?: boolean;
  alreadyLinked?: boolean;
  audienceLinked?: boolean;
  enqueued?: number;
  skipped?: number;
  warning?: string;
  message?: string;
};

export function isAudienceLinkResponse(data: unknown): data is AudienceLinkResponse {
  return (
    data != null &&
    typeof data === "object" &&
    ("audienceLinked" in data || "alreadyLinked" in data)
  );
}

/**
 * Returns the warning to show for a link that added nothing, or `undefined`
 * when the response is a real success (or is not an audience link at all).
 */
export function getAudienceLinkWarning(data: unknown): string | undefined {
  if (!isAudienceLinkResponse(data) || !data.success) return undefined;
  if (data.warning) return data.warning;
  if (data.alreadyLinked) {
    return "This audience is already added to the campaign. Nothing new was queued.";
  }
  if (data.enqueued !== 0) return undefined;
  const skipped = data.skipped ?? 0;
  if (skipped > 0) {
    return `Audience linked, but all ${skipped} of its contacts were already in the queue. Nothing new was added.`;
  }
  return "Audience linked, but it has no contacts to add to the queue.";
}
