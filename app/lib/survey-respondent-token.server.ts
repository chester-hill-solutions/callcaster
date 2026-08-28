import { env } from "@/lib/env.server";
import { randomUUID } from "node:crypto";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type RespondentTokenPayload = {
  survey_id: number;
  workspace: string;
  result_id: string;
  exp: number;
};

function getSecret(): string {
  return env.BETTER_AUTH_SECRET();
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

async function importKey() {
  return crypto.subtle.importKey(
    "raw",
    Buffer.from(getSecret(), "utf8"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(message: string): Promise<ArrayBuffer> {
  const key = await importKey();
  return crypto.subtle.sign("HMAC", key, Buffer.from(message, "utf8"));
}

export async function createRespondentToken(
  surveyId: number,
  workspace: string,
): Promise<{ token: string; resultId: string }> {
  const resultId = randomUUID();
  const payload: RespondentTokenPayload = {
    survey_id: surveyId,
    workspace,
    result_id: resultId,
    exp: Math.floor((Date.now() + TOKEN_TTL_MS) / 1000),
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encoded = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(JSON.stringify(payload))}`;
  const signature = await sign(encoded);
  const token = `${encoded}.${Buffer.from(new Uint8Array(signature)).toString("base64url")}`;
  return { token, resultId };
}

export async function verifyRespondentToken(
  token: string,
  expectedSurveyId?: number,
): Promise<RespondentTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    return null;
  }
  try {
    const header = JSON.parse(base64urlDecode(headerB64)) as { alg: string; typ: string };
    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return null;
    }
    const payload = JSON.parse(base64urlDecode(payloadB64)) as RespondentTokenPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const signed = `${headerB64}.${payloadB64}`;
    const key = await importKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Buffer.from(sigB64, "base64url"),
      Buffer.from(signed, "utf8"),
    );
    if (!valid) {
      return null;
    }
    if (expectedSurveyId !== undefined && payload.survey_id !== expectedSurveyId) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
