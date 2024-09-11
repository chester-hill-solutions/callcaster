import { redirect } from "@remix-run/node";
import {
  Outlet,
  useOutlet,
  useOutletContext,
} from "@remix-run/react";
import CampaignEmptyState from "~/components/CampaignEmptyState";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const loader = async ({ request, params }) => {
  const { headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) {
    return redirect("/signin", { headers });
  }
  return null;
};

export default function SelectedType() {
  const outlet = useOutlet();
  const { selectedTable, audiences, campaigns, phoneNumbers, userRole, flags } =
    useOutletContext();
  return !outlet ? (
    <CampaignEmptyState
      hasAccess={userRole === "admin" || userRole === "owner"}
      type={phoneNumbers?.length > 0 ? "campaign" : "number"}
    />
  ) : (
    <Outlet context={{ selectedTable, audiences, campaigns, flags }} />
  );
}
