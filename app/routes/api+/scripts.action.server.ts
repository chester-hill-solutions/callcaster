import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { persistWorkspaceScript } from "@/lib/script-persistence.server";
import { AppError } from "@/lib/errors.server";
import { isUniqueViolation } from "@/lib/parse-utils.server";
import { toUserMessage } from "@/lib/user-message";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: ({ request }: { request: Request }) => requireDualAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {

  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await safeParseJson<Record<string, unknown>>(request);
  const {
    id,
    name,
    steps,
    workspace,
    saveAsCopy
  } = data;
  
  try {
    if (
      typeof name !== "string" ||
      typeof workspace !== "string" ||
      (typeof id !== "number" && typeof id !== "string" && id != null)
    ) {
      return routeData({ error: "Invalid script payload" }, { status: 400 });
    }

    await requireWorkspaceAccess({ user, workspaceId: workspace });

    let updatedScript;
    if (saveAsCopy) {
      updatedScript = await persistWorkspaceScript({
        mode: "copy",
        workspaceId: workspace,
        actorId: user.id,
        sourceScriptId: id == null ? undefined : Number(id),
        content: { name, steps: steps ?? null },
      });
    } else if (!id) {
      updatedScript = await persistWorkspaceScript({
        mode: "create",
        workspaceId: workspace,
        actorId: user.id,
        content: { name, steps: steps ?? null },
      });
    } else {
      const scriptId = typeof id === "number" ? id : Number(id);
      updatedScript = await persistWorkspaceScript({
        mode: "update",
        workspaceId: workspace,
        scriptId,
        actorId: user.id,
        content: { name, steps: steps ?? null },
      });
    }

    if (!updatedScript) {
      return routeData({ error: "Script not found" }, { status: 404 });
    }

    return routeData({ script: updatedScript });

  } catch (error) {
    logger.error("Error updating/creating script:", error);
    if (error instanceof AppError) {
      return routeData({ error: error.message }, { status: error.statusCode });
    }
    if (isUniqueViolation(error)) {
      return routeData(
        { error: "A script with this name already exists in the workspace" },
        { status: 400 }
      );
    }
    return routeData(
      { error: toUserMessage(error, "Failed to save the script. Please try again.") },
      { status: 500 },
    );
  }
  },
});
