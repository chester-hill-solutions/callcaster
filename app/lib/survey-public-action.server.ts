import { data as routeData } from "react-router";

import {
  checkRateLimit,
  clientRateLimitKey,
  rateLimitResponse,
} from "@/lib/platform-rate-limit.server";
import { getActiveSurveyByPublicId } from "@/lib/survey-db.server";
import { loadSurveyRespondentContact } from "@/lib/survey-respondent.server";
import {
  createRespondentToken,
  verifyRespondentToken,
} from "@/lib/survey-respondent-token.server";

const SURVEY_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

type SurveyRecord = { id: number; is_active: boolean; workspace: string };
type ErrorResponse = ReturnType<typeof routeData> | Response;

function getRespondentToken(
  request: Request,
  formData: FormData,
): string | null {
  const url = new URL(request.url);
  return (
    url.searchParams.get("respondent_token") ||
    (formData.get("respondent_token") as string | null)
  );
}

async function resolveRespondentToken(
  request: Request,
  formData: FormData,
  survey: SurveyRecord,
): Promise<
  | { ok: true; resultId: string; token: string }
  | { ok: false; response: ErrorResponse }
> {
  const token = getRespondentToken(request, formData);
  if (token) {
    const payload = await verifyRespondentToken(token, survey.id);
    if (!payload) {
      return {
        ok: false,
        response: routeData(
          { error: "Invalid or expired respondent token" },
          { status: 400 },
        ),
      };
    }
    return { ok: true, resultId: payload.result_id, token };
  }
  const created = await createRespondentToken(survey.id, survey.workspace);
  return { ok: true, resultId: created.resultId, token: created.token };
}

export type PublicSurveySubmission = {
  formData: FormData;
  survey: SurveyRecord;
  resultId: string;
  token: string;
};

export type PublicSurveyGuard =
  | { ok: true; value: PublicSurveySubmission }
  | { ok: false; response: ErrorResponse };

export type PublicSurveyRequiredField = "questionId" | "pageId";

/**
 * The shared front door for public survey submissions (#1892): rate limit,
 * honeypot, required fields, survey lookup, and respondent-token resolution.
 * `survey-answer` and `survey-complete` carried byte-identical copies.
 */
export async function guardPublicSurveySubmission(
  request: Request,
  options: { rateLimitKey: string; extraRequiredFields?: PublicSurveyRequiredField[] },
): Promise<PublicSurveyGuard> {
  const rateLimit = await checkRateLimit({
    key: clientRateLimitKey(request, options.rateLimitKey),
    ...SURVEY_RATE_LIMIT,
  });
  if (!rateLimit.ok) {
    return {
      ok: false,
      response: rateLimitResponse(rateLimit.retryAfterSeconds),
    };
  }

  const formData = await request.formData();
  const honeypot = formData.get("website");
  if (honeypot && typeof honeypot === "string" && honeypot.trim().length > 0) {
    return {
      ok: false,
      response: routeData({ error: "Invalid submission" }, { status: 400 }),
    };
  }

  const surveyId = formData.get("surveyId") as string;
  const missingExtra = (options.extraRequiredFields ?? []).some(
    (field) => !(formData.get(field) as string),
  );
  if (!surveyId || missingExtra) {
    return {
      ok: false,
      response: routeData({ error: "Missing required fields" }, { status: 400 }),
    };
  }

  const survey = await getActiveSurveyByPublicId(surveyId);
  if (!survey) {
    return {
      ok: false,
      response: routeData({ error: "Survey not found" }, { status: 404 }),
    };
  }
  if (!survey.is_active) {
    return {
      ok: false,
      response: routeData({ error: "Survey is not active" }, { status: 400 }),
    };
  }

  const tokenResult = await resolveRespondentToken(request, formData, survey);
  if (!tokenResult.ok) {
    return { ok: false, response: tokenResult.response };
  }

  return {
    ok: true,
    value: {
      formData,
      survey,
      resultId: tokenResult.resultId,
      token: tokenResult.token,
    },
  };
}

export type PublicSurveyContact =
  | { ok: true; contactId: number | null }
  | { ok: false; response: ErrorResponse };

/** Parses and validates the optional `contactId` field for a submission. */
export async function resolvePublicSurveyContactId(
  formData: FormData,
  survey: Pick<SurveyRecord, "workspace">,
): Promise<PublicSurveyContact> {
  const contactId = formData.get("contactId") as string;
  const contactIdNum = contactId ? parseInt(contactId, 10) : null;
  if (contactIdNum !== null && Number.isNaN(contactIdNum)) {
    return {
      ok: false,
      response: routeData({ error: "Invalid contact ID" }, { status: 400 }),
    };
  }
  if (contactIdNum !== null) {
    // Scoped to the survey's workspace, so a foreign id simply does not resolve.
    const contact = await loadSurveyRespondentContact(
      contactIdNum,
      survey.workspace,
    );
    if (!contact) {
      return {
        ok: false,
        response: routeData({ error: "Invalid contact" }, { status: 400 }),
      };
    }
  }
  return { ok: true, contactId: contactIdNum };
}
