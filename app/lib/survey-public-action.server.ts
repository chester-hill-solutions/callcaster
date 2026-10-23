import { data as routeData } from "react-router";

import {
  checkRateLimit,
  clientRateLimitKey,
  rateLimitResponse,
} from "@/lib/platform-rate-limit.server";
import { getActiveSurveyByPublicId } from "@/lib/survey-db.server";
import { loadSurveyRespondentContact } from "@/lib/survey-respondent.server";
import { verifyRespondentToken } from "@/lib/survey-respondent-token.server";

const SURVEY_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

type SurveyRecord = { id: number; is_active: boolean; workspace: string };
type ErrorResponse = ReturnType<typeof routeData> | Response;

function getRespondentToken(
  request: Request,
  formData: FormData,
): string | null {
  const url = new URL(request.url);
  const token = url.searchParams.get("respondent_token") || formData.get("respondent_token");
  return typeof token === "string" && token.length > 0 ? token : null;
}

async function resolveRespondentToken(
  request: Request,
  formData: FormData,
  survey: SurveyRecord,
): Promise<
  | { ok: true; resultId: string; token: string; contactId: number | null }
  | { ok: false; response: ErrorResponse }
> {
  const token = getRespondentToken(request, formData);
  if (token) {
    const payload = await verifyRespondentToken(token, survey.id);
    if (!payload || payload.workspace !== survey.workspace) {
      return {
        ok: false,
        response: routeData(
          { error: "Invalid or expired respondent token" },
          { status: 400 },
        ),
      };
    }
    return {
      ok: true,
      resultId: payload.result_id,
      token,
      contactId: payload.contact_id ?? null,
    };
  }
  return {
    ok: false,
    response: routeData({ error: "Respondent token is required" }, { status: 400 }),
  };
}

export type PublicSurveySubmission = {
  formData: FormData;
  survey: SurveyRecord;
  resultId: string;
  token: string;
  /**
   * The contact this token belongs to, or null when the respondent is
   * anonymous. The only thing that may name the contact a submission acts as.
   */
  contactId: number | null;
};

export type PublicSurveyGuard =
  | { ok: true; value: PublicSurveySubmission }
  | { ok: false; response: ErrorResponse };

export type PublicSurveyRequiredField = "questionId" | "pageId";

/**
 * The shared front door for public survey submissions: rate limit
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
      contactId: tokenResult.contactId,
    },
  };
}

export type PublicSurveyContact =
  | { ok: true; contactId: number | null }
  | { ok: false; response: ErrorResponse };

/**
 * Resolves the contact a public submission may act as.
 *
 * `tokenContactId` is the contact the respondent token was minted for, or null
 * for an anonymous session. The token is the only thing that names that
 * contact, so a submitted `contactId` field is never trusted: a value that
 * disagrees with the token is IGNORED, and the response is recorded against the
 * token's contact — unattributed when the token names none.
 *
 * Rejecting a disagreeing id instead would 400 a submission the product used to
 * accept. A link carrying a bare `?contact=` id and no proof now loads
 * anonymously (#2868), and the page then posts the id it was given, so the
 * disagreement is the normal case rather than an attack. Only a value that is
 * not a number at all is a client error, because that is malformed input rather
 * than a stale link.
 */
export async function resolvePublicSurveyContactId(
  formData: FormData,
  survey: Pick<SurveyRecord, "workspace">,
  tokenContactId: number | null = null,
): Promise<PublicSurveyContact> {
  const submitted = formData.get("contactId") as string | null;
  if (submitted && Number.isNaN(parseInt(submitted, 10))) {
    return {
      ok: false,
      response: routeData({ error: "Invalid contact ID" }, { status: 400 }),
    };
  }

  if (tokenContactId === null) {
    return { ok: true, contactId: null };
  }

  // Scoped to the survey's workspace, so a foreign id simply does not resolve.
  const contact = await loadSurveyRespondentContact(
    tokenContactId,
    survey.workspace,
  );
  if (!contact) {
    return {
      ok: false,
      response: routeData({ error: "Invalid contact" }, { status: 400 }),
    };
  }
  return { ok: true, contactId: tokenContactId };
}
