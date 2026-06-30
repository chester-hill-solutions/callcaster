import {
  getHandsetLoaderData,
  type HandsetLoaderData,
} from "@/lib/handset/handset-session.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { verifyAuth } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export type { HandsetLoaderData };

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const {user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!workspaceId) {
    throw new Response("Workspace not found", { status: 404 });
  }

  await requireWorkspaceAccess({user,
    workspaceId,
  });

  return getHandsetLoaderData({user,
    workspaceId,
  });
};
