import { redirect, data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const methods = (url.searchParams.get("methods") ?? "totp").split(",");
  const next = url.searchParams.get("next");
  return routeData({ methods, next });
};
