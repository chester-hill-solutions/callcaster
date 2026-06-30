import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {

  await verifyAuth(request);
  const { data: { session } } = await request.getSession();
  if (!session) return redirect("/remember");
  return routeData({});
}
