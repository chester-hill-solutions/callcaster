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
  return payload?.workspace === args.workspace ? { token, resultId: payload.result_id } : null;
}

export async function serializeRespondentCookie(args: {
  request: Request; surveyId: number; workspace: string; contactId: number | null; token: string;
}) {
  const payload = await verifyRespondentToken(args.token, args.surveyId);
  if (!payload || payload.workspace !== args.workspace) throw new Error("Invalid respondent identity");
  return respondentCookie(args.surveyId, args.contactId, args.request).serialize(args.token, {
    expires: new Date(payload.exp * 1000),
  });
}
