import { data as routeData } from "react-router";
import {
  loadExistingResponseWithAnswers,
  loadSurveyDetailByPublicId,
} from "@/lib/survey-db.server";
import { loadSurveyRespondentContact } from "@/lib/survey-respondent.server";
import { createRespondentToken } from "@/lib/survey-respondent-token.server";
import { verifySurveyContactProof } from "@/lib/survey-contact-proof.server";
import { readRespondentCookie, serializeRespondentCookie } from "@/lib/survey-respondent-cookie.server";
import {
  checkRateLimit,
  clientRateLimitKey,
  rateLimitResponse,
} from "@/lib/platform-rate-limit.server";
import { defineLoader } from "@/lib/handler.server";

export type PublicSurveyLoaderData = {
  survey: NonNullable<Awaited<ReturnType<typeof loadSurveyDetailByPublicId>>>;
  resultId: string;
  respondentToken: string;
  contact: Awaited<ReturnType<typeof loadSurveyRespondentContact>>;
  existingResponse: Awaited<ReturnType<typeof loadExistingResponseWithAnswers>>["response"];
  existingAnswers: Record<string, string | string[]>;
};

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
    const proofParam = url.searchParams.get("proof");

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
        // A `?contact=` id is a bare integer and proves nothing, so it may only
        // select a contact when the link also carries the proof this server
        // minted for that exact survey and contact (#2868). Without it the id
        // is ignored and the session is anonymous, so a guessed id cannot load
        // another respondent's identity, answers or response row.
        if (await verifySurveyContactProof(survey.id, contactId, proofParam)) {
          // Scoped to the survey's workspace: a contact from any other tenant
          // resolves to null rather than being returned to an anonymous caller.
          contact = await loadSurveyRespondentContact(contactId, survey.workspace);
        }
      }
    }

    const identityArgs = {
      request, surveyId: survey.id, workspace: survey.workspace, contactId: contact?.id ?? null,
    };
    let identity = await readRespondentCookie(identityArgs);
    let existingResponse = null;
    let existingAnswers: Record<string, string | string[]> = {};

    if (identity) {
      const existing = await loadExistingResponseWithAnswers({
        surveyInternalId: survey.id, resultId: identity.resultId,
      });
      const responseContactId = existing.response?.contact_id;
      const sameContact = responseContactId == null
        ? identityArgs.contactId === null
        : Number(responseContactId) === Number(identityArgs.contactId);
      if (existing.response && !sameContact) {
        identity = null;
      } else {
        existingResponse = existing.response;
        existingAnswers = existing.answers;
      }
    } else if (contact) {
      // `contact` is only ever set when the link carried a proof this server
      // minted for exactly this survey and contact, which is the other thing
      // that licenses resuming an existing response. A bare `?contact=` id
      // reaches neither branch, so it cannot select another respondent's row.
      const existing = await loadExistingResponseWithAnswers({
        surveyInternalId: survey.id, contactId: contact.id,
      });
      existingResponse = existing.response;
      existingAnswers = existing.answers;
    }
    // Ownership of an existing response is proven by the signed link proof
    // (which is what selects the contact above) or by the respondent cookie it
    // was issued with. Never by the id alone: the `?contact=` lookup that ran
    // here is exactly what let a guessed id mint a credential for another
    // respondent's response row (#2868).
    if (!identity) {
      const sessionContactId = contact?.id ?? null;
      const minted = await createRespondentToken(survey.id, survey.workspace, {
        resultId: existingResponse?.result_id,
        contactId: sessionContactId,
      });
      identity = {
        token: minted.token,
        resultId: minted.resultId,
        contactId: sessionContactId,
      };
    }
    const cookie = await serializeRespondentCookie({ ...identityArgs, token: identity.token });
    return routeData<PublicSurveyLoaderData>({
      survey,
      resultId: identity.resultId,
      respondentToken: identity.token,
      contact,
      existingResponse,
      existingAnswers,
    }, { headers: { "Set-Cookie": cookie, "Cache-Control": "private, no-store" } });
  },
});
