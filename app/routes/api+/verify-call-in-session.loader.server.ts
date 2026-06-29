import { createSupabaseServerClient } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { isValidPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import { getAuthSupabaseClient, requireJsonAuth } from "@/lib/api-auth.server";


const SESSION_EXPIRY_MINUTES = 10;

export const loader = async ({ request }: { request: Request }) => {

  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = createSupabaseServerClient(request);
  const supabase = getAuthSupabaseClient(auth);
  const user = auth.user;

  const verificationNumber = env.VERIFICATION_PHONE_NUMBER();
  if (!verificationNumber) {
    return routeData(
      { error: "Call-in verification is not configured" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const phoneNumberParam = url.searchParams.get("phoneNumber");
  if (!phoneNumberParam || !isValidPhoneNumber(phoneNumberParam)) {
    return routeData(
      { error: "Valid phone number is required" },
      { status: 400 }
    );
  }

  let expectedCaller: string;
  try {
    expectedCaller = normalizePhoneNumber(phoneNumberParam);
  } catch {
    return routeData({ error: "Invalid phone number format" }, { status: 400 });
  }

  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();

  const { data: session, error } = await supabase
    .from("verification_session")
    .insert({
      user_id: user.id,
      expected_caller: expectedCaller,
      status: "pending",
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    return routeData({ error: error.message }, { status: 500 });
  }

  return routeData(
    {
      success: true,
      verificationId: session.id,
      phoneNumber: verificationNumber,
      expiresAt,
    },
    { headers }
  );
}
