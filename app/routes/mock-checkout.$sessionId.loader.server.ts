import { verifyAuth } from "@/lib/auth.server";
import { getLocalMockCheckout } from "@/lib/platform-billing.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: async ({ request, params }) => {
    await verifyAuth(request);
    const session = getLocalMockCheckout(params.sessionId ?? "");
    if (!session) throw new Response("Not found", { status: 404 });
    return { creditAmount: session.creditAmount };
  },
});
