import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { signOutUser } from "@/lib/platform-auth.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: ({ request }) =>
    request.method !== "POST" ? jsonError("Method not allowed", 405) : null,
  sideEffects: ["db-write"],
  handler: async ({ request }) => {
    const headers = await signOutUser(request);
    return jsonResponse({ success: true }, 200, headers);
  },
});
