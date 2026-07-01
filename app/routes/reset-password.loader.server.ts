import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {

  const result = await verifyAuth(request);
  if (!result || !(result as any).user) return redirect("/remember");
  return routeData({});
}
