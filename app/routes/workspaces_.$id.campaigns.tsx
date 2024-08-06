import { json, redirect } from "@remix-run/node";
import { NavLink, Outlet, useLoaderData, useOutlet, useOutletContext } from "@remix-run/react";
import CampaignEmptyState from "~/components/CampaignEmptyState";
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
  const outlet = useOutlet();
  const { selectedTable, audiences, campaigns } = useOutletContext();
  return !outlet ? <CampaignEmptyState/> : <Outlet context={{ selectedTable, audiences, campaigns }} />;
}
