import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useOutletContext } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const loader = async ({ request, params }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) {
    return redirect("/signin", { headers });
  }
  return null;
};

export default function SelectedType() {
  const { selectedTable, audiences, campaigns } = useOutletContext();
  return <Outlet context={{ selectedTable, audiences, campaigns }} />;
}
