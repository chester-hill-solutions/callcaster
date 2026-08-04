import { getSession } from "@/lib/auth.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: async ({ request }) => {
    const { user } = await getSession(request);
    return { user };
  },
});
