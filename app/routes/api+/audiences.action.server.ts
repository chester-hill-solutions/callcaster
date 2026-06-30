import { data as routeData } from "react-router";
import { parseActionRequest, requireWorkspaceAccess } from "@/lib/database.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { resolveDualAuthSession } from "@/lib/api-auth.server";
import {
  deleteAudienceById,
  findAudienceWorkspaceById,
  upsertAudienceById,
} from "@/lib/audience-upload-db.server";

interface AuthSessionResponse {
  headers: Headers;
}

interface AudienceData {
  id: number;
  [key: string]: string | number | boolean | null | undefined;
}

type AudiencesDeps = {
  verifyAuth: (
    request: Request,
  ) => Promise<{ headers: Headers; user?: { id: string } }>;
  parseActionRequest: (request: Request) => Promise<Record<string, unknown>>;
  requireWorkspaceAccess: (args: {
    user?: { id: string };
    workspaceId: string;
  }) => Promise<void>;
};

export const action = async ({
  request,
  deps,
}: {
  request: Request;
  deps?: Partial<AudiencesDeps>;
}) => {
  const d = {
    verifyAuth: deps?.verifyAuth ?? resolveDualAuthSession,
    parseActionRequest: deps?.parseActionRequest ?? parseActionRequest,
    requireWorkspaceAccess:
      deps?.requireWorkspaceAccess ?? requireWorkspaceAccess,
  };
  const { headers }: AuthSessionResponse =
    await d.verifyAuth(request);

  const method = request.method;

  let response: AudienceData[] | { success: boolean } | null | undefined;

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

    const deleted = await deleteAudienceById(id);
    if (!deleted) {
      return routeData({ error: "Audience not found" }, { status: 404, headers });
    }
    response = { success: true };
  }

  return routeData(response, { headers });
};
