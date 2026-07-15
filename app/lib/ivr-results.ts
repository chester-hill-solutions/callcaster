/**
 * Aggregates IVR keypress/speech responses recorded on `outreach_attempt.result`.
 *
 * The IVR response webhook writes a nested shape keyed by page and block title:
 *
 *   { [pageId]: { [blockTitle]: userInput } }
 *
 * Block titles are user-editable, so renaming a script block mid-campaign leaves
 * older attempts keyed by the previous title. Aggregation therefore groups on the
 * stored key rather than the script's current title, and surfaces any key that no
 * longer matches the script instead of dropping it — under-reporting a response is
 * worse than showing a stale question label.
 */

/** Campaign types whose scripts collect IVR keypress/speech responses. */
const IVR_RESULT_CAMPAIGN_TYPES = new Set<string>([
  "robocall",
  "simple_ivr",
  "complex_ivr",
]);

/**
 * Whether a campaign type records responses on `outreach_attempt.result`.
 * Lives here rather than in a `.server` module so the results UI can gate on it
 * too — an empty response list is meaningful for an IVR campaign but meaningless
 * for a live-call one.
 */
export function campaignTypeCollectsIvrResponses(
  type: string | null | undefined,
): boolean {
  return Boolean(type && IVR_RESULT_CAMPAIGN_TYPES.has(type));
}

export type IvrResponseOption = {
  value: string;
  count: number;
};

export type IvrQuestionResults = {
  pageId: string;
  /** Current script title for `pageId`, when the page still exists. */
  pageTitle: string | null;
  /** The stored block-title key the response was recorded under. */
  question: string;
  /** True when `question` no longer matches a block title in the current script. */
  isStaleKey: boolean;
  total: number;
  options: IvrResponseOption[];
};

export type IvrScriptShape = {
  pages?: Record<string, { title?: string; blocks?: string[] }> | null;
  blocks?: Record<string, { title?: string }> | null;
} | null;

/** Parses `outreach_attempt.result`, which may be stored as JSON or a JSON string. */
export function parseIvrResult(result: unknown): Record<string, unknown> | null {
  if (!result) return null;

  let value: unknown = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Normalizes a recorded answer to a display value; `null` means "no answer given". */
function normalizeAnswer(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object") return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function currentBlockTitles(script: IvrScriptShape): Set<string> {
  const titles = new Set<string>();
  const blocks = script?.blocks;
  if (!blocks) return titles;
  for (const [blockId, block] of Object.entries(blocks)) {
    const title = typeof block?.title === "string" ? block.title : null;
    // The webhook falls back to the block id when a block has no title, so both
    // forms are legitimate keys.
    titles.add(title ?? blockId);
  }
  return titles;
}

/**
 * Rolls a campaign's attempt results up into per-question answer counts,
 * ordered by the script's page order where available.
 */
export function aggregateIvrResponses(
  attempts: ReadonlyArray<{ result?: unknown }>,
  script?: IvrScriptShape,
): IvrQuestionResults[] {
  const knownTitles = currentBlockTitles(script ?? null);
  // Keyed by page id + NUL + question so identically-titled blocks on
  // different pages stay distinct; NUL cannot occur in either part.
  const byQuestion = new Map<string, IvrQuestionResults & { counts: Map<string, number> }>();

  for (const attempt of attempts) {
    const parsed = parseIvrResult(attempt?.result);
    if (!parsed) continue;

    for (const [pageId, pageData] of Object.entries(parsed)) {
      if (!pageData || typeof pageData !== "object" || Array.isArray(pageData)) {
        continue;
      }

      for (const [question, rawAnswer] of Object.entries(
        pageData as Record<string, unknown>,
      )) {
        const answer = normalizeAnswer(rawAnswer);
        if (answer === null) continue;

        const mapKey = `${pageId}\u0000${question}`;
        let entry = byQuestion.get(mapKey);
        if (!entry) {
          entry = {
            pageId,
            pageTitle:
              typeof script?.pages?.[pageId]?.title === "string"
                ? script.pages[pageId].title
                : null,
            question,
            isStaleKey: knownTitles.size > 0 && !knownTitles.has(question),
            total: 0,
            options: [],
            counts: new Map<string, number>(),
          };
          byQuestion.set(mapKey, entry);
        }

        entry.counts.set(answer, (entry.counts.get(answer) ?? 0) + 1);
        entry.total += 1;
      }
    }
  }

  const pageOrder = Object.keys(script?.pages ?? {});
  const orderOf = (pageId: string) => {
    const index = pageOrder.indexOf(pageId);
    // Pages missing from the current script sort last rather than first.
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return Array.from(byQuestion.values())
    .map(({ counts, ...entry }) => ({
      ...entry,
      options: Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    }))
    .sort(
      (a, b) =>
        orderOf(a.pageId) - orderOf(b.pageId) ||
        a.pageId.localeCompare(b.pageId) ||
        a.question.localeCompare(b.question),
    );
}
