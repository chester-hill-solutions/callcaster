export { middleware } from "./$workspaceId.middleware.server";

import { Outlet } from "react-router";

/**
 * Data-plane layout for `/api/workspaces/:workspaceId/*`.
 *
 * Middleware lives here so nested resource routes inherit
 * `dataPlaneAuthContext`. Segment GET/PATCH/DELETE handlers live in
 * `$workspaceId/route.tsx` (a child index) — not a sibling `.route.tsx`
 * and not on this layout (a default component would force HTML document
 * responses for parent-path GETs).
 */
export default function WorkspaceApiLayout() {
  return <Outlet />;
}
