import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { parseActionRequest } from "@/lib/request-utils.server";
import { resolveDualAuthSession } from "@/lib/api-auth.server";
import { AppError } from "@/lib/errors.server";
import { defineAction } from "@/lib/handler.server";
import {
  deleteAudienceById,
  findAudienceWorkspaceById,
  upsertAudienceById,
} from "@/lib/audience-upload-db.server";

interface AudienceData {
  id: number;
  [key: string]: string | number | boolean | null | undefined;
}

type AudiencesDeps = {
  verifyAuth: (
    request: Request,
  ) => Promise<{
    auth?: { authType: string; workspaceId?: string };
    headers: Headers;
    user?: { id: string };
  }>;
  parseActionRequest: (request: Request) => Promise<Record<string, unknown>>;
  requireWorkspaceAccess: (args: {
    user: { id: string };
    workspaceId: string;
  }) => Promise<void>;
};

async function requireAudienceWorkspaceAccess(args: {
  auth?: { authType: string; workspaceId?: string };
  user?: { id: string };
  workspaceId: string;
  requireWorkspaceAccess: AudiencesDeps["requireWorkspaceAccess"];
}) {
  if (args.auth?.authType === "api_key") {
    if (args.auth.workspaceId !== args.workspaceId) {
      throw new AppError("Unauthorized", 403);
    }
    return;
  }
  if (!args.user) {
    throw new AppError("Unauthorized", 401);
  }
  await args.requireWorkspaceAccess({
    user: args.user,
    workspaceId: args.workspaceId,
  });
}

export const action = defineAction({
  sideEffects: ["db-write"],
  handler: async ({
    request,
    deps,
  }: ActionFunctionArgs & { deps?: Partial<AudiencesDeps> }) => {
  const d = {
    verifyAuth: deps?.verifyAuth ?? resolveDualAuthSession,
    parseActionRequest: deps?.parseActionRequest ?? parseActionRequest,
    requireWorkspaceAccess:
      deps?.requireWorkspaceAccess ?? requireWorkspaceAccess,
  };
  const { auth, headers, user } = await d.verifyAuth(request);

  const method = request.method;

  let response: AudienceData[] | { success: boolean } | null | undefined;

  try {
    if (method === "PATCH") {
      const raw = await d.parseActionRequest(request);
      const data: Partial<AudienceData> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (key === "id") {
          data.id = parseInt(String(value ?? ""), 10);
        } else if (value != null && typeof value !== "object") {
          data[key] = String(value);
        }
      }

      if (!data.id) {
        return routeData({ error: "Missing id" }, { status: 400, headers });
      }

      const workspaceId = await findAudienceWorkspaceById(data.id);
      if (!workspaceId) {
        return routeData({ error: "Audience not found" }, { status: 404, headers });
      }
      await requireAudienceWorkspaceAccess({
        auth,
        user,
        workspaceId,
        requireWorkspaceAccess: d.requireWorkspaceAccess,
      });

      const { id: _id, ...updateValues } = data;
      const update = await upsertAudienceById(data.id, updateValues);
      if (!update) {
        return routeData({ error: "Audience not found" }, { status: 404, headers });
      }
      response = [update];
    }

    if (method === "DELETE") {
      const raw = await d.parseActionRequest(request);
      const idStr = raw.id != null ? String(raw.id) : "";
      if (!idStr) {
        return routeData({ error: "Missing id" }, { status: 400, headers });
      }
      const id = parseInt(idStr.toString(), 10);
      if (isNaN(id)) {
        return routeData({ error: "Invalid id" }, { status: 400, headers });
      }

      const workspaceId = await findAudienceWorkspaceById(id);
      if (!workspaceId) {
        return routeData({ error: "Audience not found" }, { status: 404, headers });
      }
      await requireAudienceWorkspaceAccess({
        auth,
        user,
        workspaceId,
        requireWorkspaceAccess: d.requireWorkspaceAccess,
      });

      const deleted = await deleteAudienceById(id);
      if (!deleted) {
        return routeData({ error: "Audience not found" }, { status: 404, headers });
      }
      response = { success: true };
    }
  } catch (error) {
    if (error instanceof AppError) {
      return routeData({ error: error.message }, { status: error.statusCode, headers });
    }
    throw error;
  }

  return routeData(response, { headers });
  },
});
