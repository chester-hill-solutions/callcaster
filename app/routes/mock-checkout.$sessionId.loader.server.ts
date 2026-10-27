import { verifyAuth } from "@/lib/auth.server";
import { getLocalMockCheckout } from "@/lib/platform-billing.server";

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { sessionId?: string };
}) {
  await verifyAuth(request);
  const session = getLocalMockCheckout(params.sessionId ?? "");
  if (!session) throw new Response("Not found", { status: 404 });
  return { creditAmount: session.creditAmount };
}
