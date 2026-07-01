import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { getSession } from "@/lib/auth.server";
import { isValidPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { insertVerificationSession } from "@/lib/verification-db.server";

const SESSION_EXPIRY_MINUTES = 10;

export const loader = async ({ request }: { request: Request }) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = await getSession(request);
  const user = auth.user;

  const verificationNumber = env.VERIFICATION_PHONE_NUMBER();
  if (!verificationNumber) {
    return routeData({ error: "Call-in verification is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const phoneNumberParam = url.searchParams.get("phoneNumber");
  if (!phoneNumberParam || !isValidPhoneNumber(phoneNumberParam)) {
    return routeData({ error: "Valid phone number is required" }, { status: 400 });
  }

  let expectedCaller: string;
  try {
    expectedCaller = normalizePhoneNumber(phoneNumberParam);
  } catch {
    return routeData({ error: "Invalid phone number format" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();
  const sessionId = crypto.randomUUID();

  try {
    const session = await insertVerificationSession({
      id: sessionId,
      userId: user.id,
      expectedCaller,
      expiresAt,
      createdAt,
    });

    if (!session) {
      return routeData({ error: "Failed to create verification session" }, { status: 500 });
    }

    return routeData(
      {
        success: true,
        verificationId: session.id,
        phoneNumber: verificationNumber,
        expiresAt,
      },
      { headers },
    );
  } catch (error) {
    return routeData(
      { error: error instanceof Error ? error.message : "Failed to create verification session" },
      { status: 500 },
    );
  }
};
