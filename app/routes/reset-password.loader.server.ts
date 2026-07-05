import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? null;
  return routeData({ token });
}
