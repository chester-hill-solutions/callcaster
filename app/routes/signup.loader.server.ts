import { getSession } from "@/lib/auth.server";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { headers, user } = await getSession(request);

  if (user) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ user }, { headers });
};
