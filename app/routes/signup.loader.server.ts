import { getSession } from "@/lib/auth.server";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { headers } = await getSession(request);
  const { data: serverSession } = await request.getSession();

  if (serverSession?.session) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ serverSession }, { headers });
};
