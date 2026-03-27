import type { RouteConfig } from "@remix-run/route-config";
import { flatRoutes } from "@remix-run/fs-routes";

const routeRoots = [
  "routing/api",
  "routing/workspace",
  "routing/admin",
  "routing/marketing",
  "routing/public",
  "routing/legacy",
] as const;

export default (
  await Promise.all(routeRoots.map((rootDirectory) => flatRoutes({ rootDirectory })))
).flat() satisfies RouteConfig;
