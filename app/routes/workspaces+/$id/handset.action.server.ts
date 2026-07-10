import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { endHandsetSession } from "@/lib/handset/handset-session.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params, context }: ActionFunctionArgs) => {
  if (request.method !== "POST") return null;
  const formData = await request.formData();
  if (formData.get("intent") !== "end_session") return null;

  const { user } = getWorkspaceRouteContext(context)

  const workspaceId = params.id;
  if (!workspaceId) return new Response("Not found", { status: 404 });

  await endHandsetSession({ workspaceId, userId: user.id });
  return null;
};
