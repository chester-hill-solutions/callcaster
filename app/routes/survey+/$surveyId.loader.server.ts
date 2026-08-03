import { data as routeData } from "react-router";
import {
  loadExistingResponseWithAnswers,
  loadSurveyDetailByPublicId,
} from "@/lib/survey-db.server";
import { loadSurveyRespondentContact } from "@/lib/survey-respondent.server";
import {
  checkRateLimit,
  clientRateLimitKey,
  rateLimitResponse,
} from "@/lib/platform-rate-limit.server";
import { defineLoader } from "@/lib/handler.server";

/**
 * `?contact=` is a bare integer on links already in the wild, so it cannot be
 * replaced with a signed token without breaking them. Scoping the lookup to the
 * survey's own workspace makes a cross-tenant read impossible; this limit is
 * what stops an attacker walking ids *within* that workspace.
 */
const CONTACT_LOOKUP_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: async ({ request, params, url }) => {
    const { surveyId } = params;
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
        const rate = await checkRateLimit({
          key: clientRateLimitKey(request, "survey:contact-lookup"),
          ...CONTACT_LOOKUP_RATE_LIMIT,
        });
        if (!rate.ok) {
          throw rateLimitResponse(rate.retryAfterSeconds);
        }
        // Scoped to the survey's workspace: a contact from any other tenant
        // resolves to null rather than being returned to an anonymous caller.
        contact = await loadSurveyRespondentContact(contactId, survey.workspace);
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
  },
});
