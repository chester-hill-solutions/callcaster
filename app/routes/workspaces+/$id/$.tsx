export { loader } from "./$.loader.server";
export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

/**
 * Never rendered: the loader always throws a 404, so the ErrorBoundary
 * above is this route's only UI. A default export is still required, or
 * React Router treats the module as a resource route and returns the
 * thrown Response raw instead of rendering the boundary.
 */
export default function WorkspaceNotFoundRoute() {
  return null;
}
