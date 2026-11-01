import { verifyAuth } from "@/lib/auth.server";
import { getLocalMockCheckout } from "@/lib/platform-billing.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: async ({ request, params }) => {
    const { user } = await verifyAuth(request);
    const session = await getLocalMockCheckout({ userId: user.id, sessionId: params.sessionId ?? "" });
    if (!session) throw new Response("Not found", { status: 404 });
    return { creditAmount: session.creditAmount };
  },
});
