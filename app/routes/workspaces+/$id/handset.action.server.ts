import { endHandsetSession } from "@/lib/handset/handset-session.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return null;
  const formData = await request.formData();
  if (formData.get("intent") !== "end_session") return null;

  const { user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (!workspaceId) return new Response("Not found", { status: 404 });

  await endHandsetSession({ workspaceId, userId: user.id });
  return null;
};
