import { json } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import { env } from "@/lib/env.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { isValidPhoneNumber } from "@/lib/utils/phone";

const SESSION_EXPIRY_MINUTES = 10;

export const loader = async ({ request }: { request: Request }) => {
  const { supabaseClient: supabase, headers, user } = await verifyAuth(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const verificationNumber = env.VERIFICATION_PHONE_NUMBER();
  if (!verificationNumber) {
    return json(
      { error: "Call-in verification is not configured" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const phoneNumberParam = url.searchParams.get("phoneNumber");
  if (!phoneNumberParam || !isValidPhoneNumber(phoneNumberParam)) {
    return json(
      { error: "Valid phone number is required" },
      { status: 400 }
    );
  }

  let expectedCaller: string;
  try {
    expectedCaller = normalizePhoneNumber(phoneNumberParam);
  } catch {
    return json({ error: "Invalid phone number format" }, { status: 400 });
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
    return json({ error: error.message }, { status: 500 });
  }

  return json(
    {
      success: true,
      verificationId: session.id,
      phoneNumber: verificationNumber,
      expiresAt,
    },
    { headers }
  );
};
