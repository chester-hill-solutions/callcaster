/**
 * Shared mutation plumbing for the create/edit survey routes. The two
 * routes submit through a fetcher (a plain submit would land on the bare
 * `/api/surveys` JSON response) and navigate on success.
 *
 * The success navigation is deliberately *derived state*, not an effect: the
 * routes render `<Navigate>` when the fetcher resolves, which the
 * effect-strictness rules exist to push you toward.
 */

export type SurveySubmitResult =
  | { success: true; survey: { survey_id: string } }
  | { error: string };

/** The fetcher's error message when the mutation failed, else null. */
export function surveySubmitError(data: unknown): string | null {
  if (data == null || typeof data !== "object" || !("error" in data)) {
    return null;
  }
  return typeof data.error === "string" ? data.error : null;
}

/**
 * The survey detail path once the mutation succeeds, else null. Render it as
 * `<Navigate to={path} />` — no `useEffect` needed to react to `fetcher.data`.
 */
export function surveySuccessPath(
  workspaceId: string,
  data: SurveySubmitResult | undefined,
): string | null {
  if (!data || !("success" in data) || !data.success) {
    return null;
  }
  return `/workspaces/${workspaceId}/surveys/${data.survey.survey_id}`;
}