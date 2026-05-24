import {
  getHandsetLoaderData,
  type HandsetLoaderData,
} from "@/lib/handset/handset-session.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export type { HandsetLoaderData };

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    throw new Response("Workspace not found", { status: 404 });
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user,
    workspaceId,
  });

  return getHandsetLoaderData({
    supabaseClient: supabase,
    user,
    workspaceId,
  });
};
