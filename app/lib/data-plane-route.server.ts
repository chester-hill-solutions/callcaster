import type { RouterContextProvider } from "react-router";
import { dataPlaneAuthContext } from "@/lib/route-context.server";
import type { DataPlaneAuthContextValue } from "@/lib/route-context.server";

export function getDataPlaneRouteContext(
  context: Readonly<RouterContextProvider>,
  workspaceId?: string,
): DataPlaneAuthContextValue {
  const auth = context.get(dataPlaneAuthContext);
  if (!auth) {
    throw new Error("Data plane auth context missing");
  }
  if (workspaceId && auth.workspaceId !== workspaceId) {
    throw Response.json({ error: "Workspace not found" }, { status: 404 });
  }
  return auth;
}
