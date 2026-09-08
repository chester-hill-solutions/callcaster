import { workspaceLoaderAuth } from "@/lib/workspace-route.server";
import { defineLoader } from "@/lib/handler.server";

/**
 * Catch-all for unknown paths under a workspace. Without it an unmatched
 * URL falls through to the root ErrorBoundary, which renders its own
 * bare document outside the workspace chrome (#1397). Throwing a real
 * Response (not `data()`) is what routes the 404 to this route's own
 * ErrorBoundary: `withGuards` re-throws Responses but converts anything
 * else into returned data.
 */
export const loader = defineLoader({
  auth: workspaceLoaderAuth,
  sideEffects: ["none"],
  handler: async ({ auth: access }) => {
    if (!access.ok) {
      return access.response;
    }
    throw new Response(null, {
      status: 404,
      statusText: "Not Found",
      headers: access.ctx.headers,
    });
  },
});
