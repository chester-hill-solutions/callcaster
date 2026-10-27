import { redirect } from "react-router";
import { verifyAuth } from "@/lib/auth.server";
import { completeLocalMockCheckout } from "@/lib/platform-billing.server";

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { sessionId?: string };
}) {
  const { user } = await verifyAuth(request);
  const result = await completeLocalMockCheckout({
    userId: user.id,
    sessionId: params.sessionId ?? "",
  });
  if (!result.ok) throw new Response("Not found", { status: 404 });
  return redirect(
    `/confirm-payment?session_id=${encodeURIComponent(params.sessionId ?? "")}`,
  );
}
