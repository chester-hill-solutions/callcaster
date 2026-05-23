export { loader } from "./callback.loader.server";

function getSafeRedirectPath(next: string | null): string {
  if (!next || !next.startsWith("/")) {
    return "/";
  }

  return next.startsWith("//") ? "/" : next;
}

