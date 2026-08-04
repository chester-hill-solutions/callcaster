import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { endHandsetSession } from "@/lib/handset/handset-session.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, params, auth }) => {
    if (request.method !== "POST") return null;
    const formData = await request.formData();
    if (formData.get("intent") !== "end_session") return null;

    const { user } = auth;

    const workspaceId = params.id;
    if (!workspaceId) return new Response("Not found", { status: 404 });

    await endHandsetSession({ workspaceId, userId: user.id });
    return null;
  },
});
