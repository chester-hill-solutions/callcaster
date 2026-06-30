import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getScriptExportFields } from "@/lib/script-api-db.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  const access = await requireWorkspaceLoaderContext(request, params.id);
  if (!access.ok) {
    return access.response;
  }
  const { headers, workspaceId } = access.ctx;

  const formData = await request.formData();
  const data = Object.fromEntries(formData.entries());

  const idValue = data["id"];
  if (!idValue) {
    return routeData({ error: "Script ID is required" }, { status: 400, headers });
  }

  const scriptId = Number(idValue) || 0;
  let script: { name: string; steps: unknown } | null;
  try {
    script = await getScriptExportFields(workspaceId, scriptId);
  } catch (error) {
    logger.error("Error fetching script:", error);
    return routeData({ error: "Error fetching script" }, { status: 500, headers });
  }

  if (!script) {
    return routeData({ error: "Script not found" }, { status: 404, headers });
  }

  const scriptJson = JSON.stringify(script.steps,  2);

  const fileName = script.name
    ? `${script.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`
    : `callcaster_script_${new Date().toISOString().split("T")[0]}.json`;

  return routeData(
    {
      fileContent: scriptJson,
      fileName: fileName,
      contentType: "application/json",
    },
    {
      headers: {
        ...headers,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/json",
      },
    },
  );
}
