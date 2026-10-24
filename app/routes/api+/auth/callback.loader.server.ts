import { redirect } from "react-router";
import { getSafeRedirectPath } from "@/lib/safe-redirect";
import { consumeVerificationToken } from "@/lib/verification-token.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["db-write"],
  handler: async ({ request, url }) => {
    const token_hash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    const next = getSafeRedirectPath(url.searchParams.get("next"));

    if (token_hash && type) {
      const outcome = await consumeVerificationToken(request, token_hash);
      if (outcome.ok) {
        return redirect(next, { headers: outcome.headers });
      }
    }

    return redirect("/signin");
  },
});
