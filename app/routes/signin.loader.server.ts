import { getSession, verifyAuth } from "@/lib/auth.server";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { headers} = await getSession(request);
  const { data: { user } } = await request.getUser();

  if (user) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ user }, { headers });
}
