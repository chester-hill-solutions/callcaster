import { env } from "@/lib/env.server";

/**
 * A per-contact proof that a survey link was minted for a specific contact.
 *
 * `?contact=<id>` is a bare integer, so it proves nothing: anyone holding any
 * survey link can name another respondent's contact id. The loader used to
 * treat that id as ownership of a response row (#2868). This proof is what a
 * link carries instead — an HMAC over the survey and the contact, signed with
 * the same application secret the respondent token uses — so a contact id only
 * ever selects an existing response when it arrives with a signature that
 * matches it.
 *
 * Format: `<exp>.<base64url HMAC>` and nothing else, so it is URL-safe and
 * carries no separator that would collide with the `q` payload's `:`.
 */

/** How long a minted link keeps working. Long, because a sent message is. */
const PROOF_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

async function importKey() {
  return crypto.subtle.importKey(
    "raw",
    Buffer.from(env.BETTER_AUTH_SECRET(), "utf8"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** The exact string that is signed. Versioned so a future change is explicit. */
function proofMessage(surveyId: number, contactId: number, exp: number): string {
  return `survey-contact-proof:v1:${surveyId}:${contactId}:${exp}`;
}

export async function createSurveyContactProof(
  surveyId: number,
  contactId: number,
  options: { expiresAtSeconds?: number } = {},
): Promise<string> {
  const numericSurveyId = Number(surveyId);
  const numericContactId = Number(contactId);
  if (!Number.isSafeInteger(numericSurveyId) || numericSurveyId <= 0) {
    throw new Error("Invalid survey identity");
  }
  if (!Number.isSafeInteger(numericContactId) || numericContactId <= 0) {
    throw new Error("Invalid contact identity");
  }

  const exp =
    options.expiresAtSeconds ??
    Math.floor((Date.now() + PROOF_TTL_MS) / 1000);
  const key = await importKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    Buffer.from(proofMessage(numericSurveyId, numericContactId, exp), "utf8"),
  );
  const encoded = Buffer.from(new Uint8Array(signature)).toString("base64url");
  return `${exp}.${encoded}`;
}

/**
 * True only when `proof` is a signature this server minted for exactly this
 * survey and contact, and it has not expired. Any malformed input is false
 * rather than a throw: this runs on a public path.
 */
export async function verifySurveyContactProof(
  surveyId: number,
  contactId: number,
  proof: string | null | undefined,
): Promise<boolean> {
  if (!proof) return false;
  const numericSurveyId = Number(surveyId);
  const numericContactId = Number(contactId);
  if (!Number.isSafeInteger(numericSurveyId) || numericSurveyId <= 0) return false;
  if (!Number.isSafeInteger(numericContactId) || numericContactId <= 0) return false;

  const [expPart, signaturePart] = proof.split(".");
  if (!expPart || !signaturePart) return false;

  const exp = Number(expPart);
  if (!Number.isSafeInteger(exp) || exp <= 0) return false;
  if (exp <= Math.floor(Date.now() / 1000)) return false;

  try {
    const key = await importKey();
    return await crypto.subtle.verify(
      "HMAC",
      key,
      Buffer.from(signaturePart, "base64url"),
      Buffer.from(
        proofMessage(numericSurveyId, numericContactId, exp),
        "utf8",
      ),
    );
  } catch {
    return false;
  }
}

/** The proof expiry, for tests and diagnostics. */
export const SURVEY_CONTACT_PROOF_TTL_MS = PROOF_TTL_MS;
