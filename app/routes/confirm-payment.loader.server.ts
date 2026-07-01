import { redirect } from "react-router";
import { verifyAuth } from "@/lib/auth.server";
import { confirmStripeCheckoutSessionForRedirect } from "@/lib/platform-billing.server";
import type { LoaderFunctionArgs } from "react-router";

function buildBillingRedirect(
  workspaceId: string,
  params: Record<string, string | number>,
) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  return redirect(`/workspaces/${workspaceId}/billing?${searchParams.toString()}`);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return redirect("/workspaces");
  }

  const nextUrl = url.pathname + (url.search ?? "");
  await verifyAuth(request, nextUrl);

  const result = await confirmStripeCheckoutSessionForRedirect({
    sessionId,
  });

  if (result.ok) {
    return buildBillingRedirect(result.workspaceId, {
      payment_status: "success",
      credits_added: result.creditAmount,
    });
  }

  if (result.workspaceId) {
    return buildBillingRedirect(result.workspaceId, {
      payment_status: "error",
      payment_message:
        "We could not confirm this payment yet. If your card was charged, please contact support.",
    });
  }

  return redirect(
    "/workspaces?payment_status=error&payment_message=We%20could%20not%20confirm%20this%20payment.",
  );
}
