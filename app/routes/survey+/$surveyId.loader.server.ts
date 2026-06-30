import { data as routeData } from "react-router";
import {
  loadContactById,
  loadExistingResponseWithAnswers,
  loadSurveyDetailByPublicId,
} from "@/lib/survey-db.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { surveyId } = params;
  const url = new URL(request.url);
  const contactIdParam = url.searchParams.get("contact");

  if (!surveyId) {
    throw new Response("Survey ID is required", { status: 400 });
  }

  const survey = await loadSurveyDetailByPublicId(surveyId, { activeOnly: true });
  if (!survey) {
    throw new Response("Survey not found or inactive", { status: 404 });
  }

  let contact = null;
  if (contactIdParam) {
    const contactId = parseInt(contactIdParam, 10);
    if (!Number.isNaN(contactId)) {
      contact = await loadContactById(contactId);
    }
  }

  const resultId = `result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let existingResponse = null;
  let existingAnswers: Record<string, string | string[]> = {};

  if (contact?.id) {
    const existing = await loadExistingResponseWithAnswers({
      surveyInternalId: survey.id,
      contactId: contact.id,
    });
    existingResponse = existing.response;
    existingAnswers = existing.answers;
  }

  return routeData({
    survey,
    resultId: existingResponse?.result_id || resultId,
    contact,
    existingResponse,
    existingAnswers,
  });
}
