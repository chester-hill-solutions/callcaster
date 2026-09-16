import type { AuthUser } from "@/lib/auth.server";
import { getSession } from "@/lib/auth.server";
import { defineLoader } from "@/lib/handler.server";

export type IndexLoaderData = {
  /** Non-null when the visitor is signed in. */
  user: AuthUser | null;
};

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: async ({ request }): Promise<IndexLoaderData> => {
    const { user } = await getSession(request);
    return { user };
  },
});