import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ url }: LoaderFunctionArgs) {
  const token = url.searchParams.get("token") ?? null;
  return routeData({ token });
}
