import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { authForScript, getScriptDetailApi } from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const scriptId = params.scriptId;
  if (!scriptId) {
    return jsonError("scriptId is required", 400);
  }

  const auth = await authForScript(request, scriptId);
  if (auth instanceof Response) return auth;

  const result = await getScriptDetailApi(
    scriptId,
    auth.workspaceId,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ script: result.script }, 200);
}
