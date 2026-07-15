export { middleware } from "./$workspaceId.middleware.server";
export { loader, action } from "./$workspaceId.action.server";

import { Outlet } from "react-router";

/**
 * Data-plane layout + segment handlers for `/api/workspaces/:workspaceId`.
 *
 * Middleware must live on this module (same pattern as `workspaces+/$id.tsx`)
 * so GET/PATCH/DELETE on the parent path inherit `dataPlaneAuthContext`.
 * A sibling `$workspaceId.route.tsx` does not nest under this layout in
 * remix-flat-routes, so loaders there never see middleware context.
 */
export default function WorkspaceApiLayout() {
  return <Outlet />;
}
