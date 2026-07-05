import { data as routeData } from "react-router";
import {
  checkRateLimit,
  clientRateLimitKey,
  rateLimitResponse,
} from "@/lib/platform-rate-limit.server";
import {
  createRespondentToken,
  verifyRespondentToken,
} from "@/lib/survey-respondent-token.server";
import {
  completeSurveyResponse,
  getActiveSurveyByPublicId,
  loadContactById,
} from "@/lib/survey-db.server";
import type { ActionFunctionArgs } from "react-router";



const SURVEY_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

function getRespondentToken(request: Request, formData: FormData): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("respondent_token") || (formData.get("respondent_token") as string | null);
}

async function resolveRespondentToken(
  request: Request,
  formData: FormData,
  survey: { id: number; workspace: string },
): Promise<{ ok: true; resultId: string; token: string } | { ok: false; response: ReturnType<typeof routeData> }> {
  const token = getRespondentToken(request, formData);
  if (token) {
    const payload = await verifyRespondentToken(token, survey.id);
    if (!payload) {
      return { ok: false, response: routeData({ error: "Invalid or expired respondent token" }, { status: 400 }) };
    }
    return { ok: true, resultId: payload.result_id, token };
  }
  const created = await createRespondentToken(survey.id, survey.workspace);
  return { ok: true, resultId: created.resultId, token: created.token };
}

async function handleCompleteSurvey(request: Request) {
  const rateLimit = checkRateLimit({
    key: clientRateLimitKey(request, "survey:complete"),
    ...SURVEY_RATE_LIMIT,
  });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const formData = await request.formData();
  const honeypot = formData.get("website");
  if (honeypot && typeof honeypot === "string" && honeypot.trim().length > 0) {
    return routeData({ error: "Invalid submission" }, { status: 400 });
  }

  const surveyId = formData.get("surveyId") as string;
  const completed = formData.get("completed") as string;

  if (!surveyId) {
    return routeData({ error: "Missing required fields" }, { status: 400 });
  }

  const survey = await getActiveSurveyByPublicId(surveyId);
  if (!survey) {
    return routeData({ error: "Survey not found" }, { status: 404 });
  }

  const tokenResult = await resolveRespondentToken(request, formData, survey);
  if (!tokenResult.ok) {
    return tokenResult.response;
  }

  const contactId = formData.get("contactId") as string;
  const contactIdNum = contactId ? parseInt(contactId, 10) : null;
  if (contactIdNum !== null && Number.isNaN(contactIdNum)) {
    return routeData({ error: "Invalid contact ID" }, { status: 400 });
  }
  if (contactIdNum !== null) {
    const contact = await loadContactById(contactIdNum);
    if (!contact || contact.workspace !== survey.workspace) {
      return routeData({ error: "Invalid contact" }, { status: 400 });
    }
  }

  const result = await completeSurveyResponse({
    surveyInternalId: survey.id,
    resultId: tokenResult.resultId,
    completed: completed === "true",
  });

  if (!result.ok) {
    return routeData({ error: result.error }, { status: result.status });
  }

  return routeData({
    success: true,
    result_id: result.result_id,
    respondent_token: tokenResult.token,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "POST") {
    return handleCompleteSurvey(request);
  }

  return routeData({ error: "Method not allowed" }, { status: 405 });
}
