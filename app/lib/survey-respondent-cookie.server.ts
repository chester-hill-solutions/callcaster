import { createCookie } from "react-router";
import { verifyRespondentToken } from "./survey-respondent-token.server";

/** One browser identity per public survey/contact context. The JWT signs the value. */
function respondentCookie(surveyId: number, contactId: number | null, request: Request) {
  return createCookie(`cc.survey.${surveyId}.${contactId ?? "anonymous"}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
  });
}

export async function readRespondentCookie(args: {
  request: Request; surveyId: number; workspace: string; contactId: number | null;
}) {
  const cookie = respondentCookie(args.surveyId, args.contactId, args.request);
  let token: unknown;
  try {
    token = await cookie.parse(args.request.headers.get("Cookie"));
  } catch {
    return null;
  }
  if (typeof token !== "string") return null;
  const payload = await verifyRespondentToken(token, args.surveyId);
  if (!payload || payload.workspace !== args.workspace) return null;
  const tokenContactId = payload.contact_id ?? null;
  // The cookie NAME is chosen by the request, so it must not decide the
  // identity: a visitor could otherwise present a token minted for one contact
  // under another contact's cookie name. The signed payload has to agree.
  if (tokenContactId !== (args.contactId ?? null)) return null;
  return { token, resultId: payload.result_id, contactId: tokenContactId };
}

export async function serializeRespondentCookie(args: {
  request: Request; surveyId: number; workspace: string; contactId: number | null; token: string;
}) {
  const payload = await verifyRespondentToken(args.token, args.surveyId);
  if (!payload || payload.workspace !== args.workspace) throw new Error("Invalid respondent identity");
  if ((payload.contact_id ?? null) !== (args.contactId ?? null)) {
    throw new Error("Respondent identity does not belong to this contact");
  }
  return respondentCookie(args.surveyId, args.contactId, args.request).serialize(args.token, {
    expires: new Date(payload.exp * 1000),
  });
}
